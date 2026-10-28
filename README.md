# Créateur de devis LAPELEC

Cet outil nous sert à créer de manière plus intuitive des devis pour le courant fort chez LAPELEC.

On décrit la villa pièce par pièce (éclairage, inters, prises, équipements, tableau), et l’outil génère le fichier à importer dans **Esabora** : un bloc par pièce, les ensembles de la bibliothèque, les poses, le bloc Domotique et le bloc Divers.

- Comptes utilisateurs (administrateur / utilisateur), plusieurs personnes en même temps sur des devis différents.
- Enregistrement automatique, reprise à tout moment, duplication de devis et de pièces.
- Calcul en direct : disjoncteurs des TD et du TGBT (dessinés sur un rail), modules KNX (TA2/TA4, RM, SM4, DM4T, DM4 DALI, JM4T).
- Export `.xlsx` : feuille **IMPORT** à importer, plus **TABLEAUX À MODIFIER** et **DÉTAIL CALCUL** pour le contrôle.

> Les prix, coefficients et taux de main d’œuvre de l’entreprise ne sont **pas** dans ce dépôt. Ils sont saisis par un administrateur dans l’outil (*Utilisateurs et prix*) ou importés depuis un fichier, et restent dans la base du serveur.

## Installation sur TrueNAS SCALE

L’image est construite automatiquement à chaque modification de `main` et publiée sur `ghcr.io/moxxie-git/devismaker-lapelec`.

1. Créer un dataset, par exemple `POOL/lapelec-devis`, avec un dossier `data` appartenant à l’utilisateur `apps` (UID 568) :
   ```bash
   sudo mkdir -p /mnt/POOL/lapelec-devis/data && sudo chown -R 568:568 /mnt/POOL/lapelec-devis
   ```
2. Apps > Discover Apps > ⋮ > **Install via YAML**, nom `lapelec-devis`, coller [`docker-compose.yml`](docker-compose.yml) en remplaçant `POOL`.
3. Ouvrir `http://IP-DU-NAS:8090` et créer le compte administrateur (la première personne qui ouvre la page le crée).
4. *Utilisateurs et prix* > *Prix et coefficients* > **Importer un fichier de prix**, puis **Enregistrer les prix**.

### Mettre à jour

Faire un instantané du dataset, puis redémarrer l’application dans TrueNAS : la dernière image est téléchargée (`pull_policy: always`). Les devis, comptes et prix ne bougent pas. Les personnes connectées voient un bandeau leur proposant de recharger la page.

Pour revenir à une version précise, remplacer `latest` par l’étiquette `sha-xxxxxxx` du commit voulu (liste dans l’onglet *Packages* du dépôt).

### Sauvegarder

Tout est dans `data/devis.db` (SQLite) : des instantanés périodiques du dataset suffisent. Garder aussi une copie du fichier de prix (*Exporter les prix*).

### Variables d’environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `8090` dans l’image | Port HTTP |
| `HOST` | `0.0.0.0` | Interface d’écoute |
| `DATA_DIR` | `/data` dans l’image | Dossier de la base SQLite |

## Développement

Node 22.13 ou plus récent (module `node:sqlite` intégré). Le serveur n’a aucune dépendance à l’exécution : `npm run build` produit un seul fichier `dist/server.mjs` et l’interface dans `dist/public/`.

```bash
npm install
npm run typecheck
npm test             # tests du moteur de calcul
npm run build        # construit dist/
npm start            # http://localhost:8080
```

Parcours complet dans un navigateur (Playwright, serveur lancé sur un dossier de données vide) : `node tests/e2e.cjs captures http://localhost:8080`.

### Organisation

```
shared/                 code commun serveur + interface
  types.ts              structure d’un devis et des résultats
  lots/index.ts         registre des lots (CFO aujourd’hui, CFA / ENR demain), paramètres, reprise des anciens devis
  lots/cfo/catalogue.ts ensembles Esabora, protections, contenu minimum des tableaux
  lots/cfo/pieces.ts    types de pièces : questions et valeurs pré-remplies
  lots/cfo/moteur.ts    règles de calcul -> lignes d’import + tableaux + domotique + alertes
server/                 API (node:http), comptes, sessions, SQLite, export xlsx
client/                 interface React
tests/                  tests du moteur (valeurs fictives) et parcours navigateur
```

### Règles principales (lot CFO)

- Une pièce = un bloc Esabora ; le nom de la pièce est répété dans la colonne N° sur chaque ligne du bloc.
- Point lumineux : `ENSEPTI` (intérieur) ou `ENSEPTE` (extérieur) + pose `MO LUM` (1 h, bandeau LED difficile 2 h).
- KNX : une ligne « Bouton poussoir knx » par pièce (nombre d’inters). TA : 1-2 boutons → TA2, 3-4 → TA4, 5-6 → TA4 + TA2, 7-8 → 2 TA4.
- Modules de sortie dans le tableau qui alimente les circuits : on/off → RM4 / RM8 / RM16, 1-10 V → SM4, 230 V → DM4T, DALI → DM4 DALI, rideaux / stores / volets → JM4T.
- Tableaux : l’ensemble minimum est toujours facturé ; l’outil donne les quantités à monter dans l’ensemble après l’import (C10 : 8 points max ; prises C20, 12 socles max ; dédiées C20 ; clim C16 ; VMC C10 ; plaque C32 ; 8 circuits max par ID, type A pour plaque et lave-linge ; départs TGBT C32 300 mA en 6 mm², C40 en 10 mm²). Les tableaux tétra ne sont pas calculés.

### Ajouter un lot (CFA, ENR…)

Créer `shared/lots/<lot>/` sur le modèle de `cfo/` (catalogue, types de pièces, moteur) et l’enregistrer dans `shared/lots/index.ts`.
