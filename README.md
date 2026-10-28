# Créateur de devis LAPELEC

Cet outil nous sert à créer de manière plus intuitive des devis pour le courant fort chez LAPELEC.

On décrit la villa pièce par pièce (éclairage, inters, prises, équipements, tableau), et l’outil génère le fichier à importer dans **Esabora** : un bloc par pièce, les ensembles de la bibliothèque, les poses, le bloc Domotique et le bloc Divers.

- Comptes utilisateurs (administrateur / utilisateur), plusieurs personnes en même temps sur des devis différents.
- Enregistrement automatique, reprise à tout moment, duplication de devis et de pièces.
- Calcul en direct : disjoncteurs des TD et du TGBT (dessinés sur un rail), modules KNX (TA2/TA4, RM, SM4, DM4T, DM4 DALI, JM4T).
- Export `.xlsx` : feuille **IMPORT** à importer, plus **TABLEAUX À MODIFIER** et **DÉTAIL CALCUL** pour le contrôle.

## Installation sur TrueNAS

L’image est construite automatiquement à chaque modification de `main` et publiée sur `ghcr.io/moxxie-git/devismaker-lapelec`.

1. Créer un dataset, par exemple `POOL/lapelec-devis`, avec un dossier `data` appartenant à l’utilisateur `apps` (UID 568) :
   ```bash
   sudo mkdir -p /mnt/POOL/lapelec-devis/data && sudo chown -R 568:568 /mnt/POOL/lapelec-devis
   ```
2. Apps > Discover Apps > ⋮ > **Install via YAML**, nom `lapelec-devis`, coller [`docker-compose.yml`](docker-compose.yml) en remplaçant `POOL`.
3. Ouvrir `http://IP-DU-NAS:8090` et créer le compte administrateur (la première personne qui ouvre la page le crée).
4. *Utilisateurs et prix* > *Prix et coefficients* > **Importer un fichier de prix**, puis **Enregistrer les prix**.

> Comme vous pouvez le voir, cette méthode de création de compte admin n'est pas compatible avec un déploiement sur internet !
> Veuillez donc éviter de déployer cet outil sur un serveur accessible publiquement !!!! 

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

### Mais pourquoi ?

Concrètement, cet outil ne vous servira probablement jamais, et c'est donc pour cette raison que je n'accepterais pas de pull request.
Si vous voulez un outil similaire pour vous ou votre entreprise, contactez moi (contact@moxxie.fr).
Pour nous à LAPELEC en revanche, cet outil nous est utile pour faciliter la tache de créer un devis sur Esabora, car c'est un peu chiant de toujours se souvenir de toute les normes et règles de création d'un chantier CFO.

### Ajouter un lot (CFA, ENR…)

Créer `shared/lots/<lot>/` sur le modèle de `cfo/` (catalogue, types de pièces, moteur) et l’enregistrer dans `shared/lots/index.ts`.
