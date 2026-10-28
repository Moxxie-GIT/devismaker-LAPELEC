// Serveur LAPELEC Devis : API JSON + interface web.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { ouvrirBase, transaction } from './db';
import { HttpError, Routeur, type Req } from './http';
import {
  controlerMotDePasse, cookieSession, COOKIE, creerSession, effacerEchecs, exigerAdmin, exigerConnexion, hacher,
  listerUtilisateurs, nombreUtilisateurs, noterEchec, trouverParLogin, utilisateurDeSession, verifier, verifierLimite,
} from './auth';
import { SchemaDevisData, SchemaEntete, SchemaParametres, valider } from './schemas';
import { fichierImport, nomFichier } from './export';
import { LOTS, fusionnerParametres, normaliserDevisData, nouveauDevisData } from '../shared/lots';
import type { Devis, DevisResume, Parametres } from '../shared/types';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

const ici = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);
const HOTE = process.env.HOST ?? '0.0.0.0';
const DONNEES = resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data'));
const PUBLIC = resolve(process.env.PUBLIC_DIR ?? join(ici, 'public'));

const db = ouvrirBase(DONNEES);
const r = new Routeur();
const id = () => randomBytes(9).toString('base64url');
const maintenant = () => new Date().toISOString();

// ---------- session sur chaque requête API
r.use((req) => {
  req.ctx.utilisateur = utilisateurDeSession(db, req.cookies[COOKIE]);
});

// ---------- paramètres
function parametres(lot = 'cfo'): Parametres {
  const row = db.prepare('SELECT valeur FROM parametres WHERE cle = ?').get(`lot:${lot}`) as any;
  return fusionnerParametres(row ? JSON.parse(row.valeur) : null);
}

// ---------- présence : qui a un devis ouvert en ce moment (mémoire)
const presence = new Map<string, Map<string, { nom: string; vu: number }>>();
function presents(devisId: string, sauf?: string): string[] {
  const m = presence.get(devisId);
  if (!m) return [];
  const limite = Date.now() - 45_000;
  return [...m.entries()].filter(([u, p]) => u !== sauf && p.vu > limite).map(([, p]) => p.nom);
}

// ---------- état, premier lancement, connexion
r.get('/api/etat', (req) => ({
  json: { version: VERSION, setupRequis: nombreUtilisateurs(db) === 0, utilisateur: req.ctx.utilisateur ?? null },
}));

r.post('/api/setup', (req) => {
  if (nombreUtilisateurs(db) > 0) throw new HttpError(409, 'Le compte administrateur existe déjà.');
  const { login, nom, motDePasse } = req.body ?? {};
  if (typeof login !== 'string' || !/^[\w.@-]{2,40}$/.test(login.trim())) throw new HttpError(400, 'Identifiant invalide (lettres, chiffres, . _ - @).');
  controlerMotDePasse(motDePasse);
  const uid = id();
  transaction(db, () => {
    if (nombreUtilisateurs(db) > 0) throw new HttpError(409, 'Le compte administrateur existe déjà.');
    db.prepare('INSERT INTO utilisateurs (id, login, nom, role, actif, hash, cree_le) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .run(uid, login.trim(), String(nom || login).trim().slice(0, 80), 'admin', hacher(motDePasse), maintenant());
  });
  const token = creerSession(db, uid);
  return { headers: { 'Set-Cookie': cookieSession(token, req.securise) }, json: { ok: true } };
});

r.post('/api/connexion', (req) => {
  const login = String(req.body?.login ?? '').trim();
  const mdp = String(req.body?.motDePasse ?? '');
  const cle = `${req.ip}|${login.toLowerCase()}`;
  verifierLimite(cle);
  const u = trouverParLogin(db, login);
  if (!u || !u.actif || !verifier(mdp, u.hash)) {
    noterEchec(cle);
    throw new HttpError(401, 'Identifiant ou mot de passe incorrect.');
  }
  effacerEchecs(cle);
  const token = creerSession(db, u.id);
  return { headers: { 'Set-Cookie': cookieSession(token, req.securise) }, json: { ok: true } };
});

r.post('/api/deconnexion', (req) => {
  const t = req.cookies[COOKIE];
  if (t) db.prepare('DELETE FROM sessions WHERE token = ?').run(t);
  return { headers: { 'Set-Cookie': cookieSession('', req.securise, true) }, json: { ok: true } };
});

r.put('/api/moi/mot-de-passe', exigerConnexion, (req) => {
  const u = trouverParLogin(db, req.ctx.utilisateur.login)!;
  if (!verifier(String(req.body?.ancien ?? ''), u.hash)) throw new HttpError(400, 'Mot de passe actuel incorrect.');
  const nouveau = controlerMotDePasse(req.body?.nouveau);
  db.prepare('UPDATE utilisateurs SET hash = ? WHERE id = ?').run(hacher(nouveau), u.id);
  return { json: { ok: true } };
});

// ---------- devis
const nomUtilisateur = (uid: string) => (db.prepare('SELECT nom FROM utilisateurs WHERE id = ?').get(uid) as any)?.nom ?? '?';

function lireDevis(devisId: string): Devis {
  const row = db.prepare('SELECT * FROM devis WHERE id = ? AND supprime = 0').get(devisId) as any;
  if (!row) throw new HttpError(404, 'Devis introuvable.');
  return {
    id: row.id, titre: row.titre, client: row.client, reference: row.reference, lot: row.lot, version: row.version,
    data: normaliserDevisData(JSON.parse(row.data)), createdBy: nomUtilisateur(row.cree_par), updatedBy: nomUtilisateur(row.modifie_par),
    createdAt: row.cree_le, updatedAt: row.modifie_le,
  };
}

r.get('/api/devis', exigerConnexion, (req) => {
  const rows = db.prepare(`
    SELECT d.id, d.titre, d.client, d.reference, d.lot, d.cree_le, d.modifie_le, d.data,
           uc.nom AS cree_par, um.nom AS modifie_par
    FROM devis d LEFT JOIN utilisateurs uc ON uc.id = d.cree_par LEFT JOIN utilisateurs um ON um.id = d.modifie_par
    WHERE d.supprime = 0 ORDER BY d.modifie_le DESC`).all() as any[];
  const liste: (DevisResume & { presents: string[] })[] = rows.map((x) => ({
    id: x.id, titre: x.titre, client: x.client, reference: x.reference, lot: x.lot,
    createdBy: x.cree_par ?? '?', updatedBy: x.modifie_par ?? '?', createdAt: x.cree_le, updatedAt: x.modifie_le,
    nbPieces: (JSON.parse(x.data).pieces ?? []).length, presents: presents(x.id, req.ctx.utilisateur.id),
  }));
  return { json: liste };
});

r.post('/api/devis', exigerConnexion, (req) => {
  const e = valider(SchemaEntete, req.body);
  const u = req.ctx.utilisateur.id;
  const did = id(); const t = maintenant();
  db.prepare(`INSERT INTO devis (id, titre, client, reference, lot, version, data, cree_par, modifie_par, cree_le, modifie_le)
              VALUES (?, ?, ?, ?, 'cfo', 1, ?, ?, ?, ?, ?)`)
    .run(did, e.titre, e.client, e.reference, JSON.stringify(nouveauDevisData(parametres())), u, u, t, t);
  return { status: 201, json: lireDevis(did) };
});

r.get('/api/devis/:id', exigerConnexion, (req) => {
  const d = lireDevis(req.params.id);
  return { json: { ...d, presents: presents(d.id, req.ctx.utilisateur.id) } };
});

r.put('/api/devis/:id', exigerConnexion, (req) => {
  const e = valider(SchemaEntete, req.body);
  const data = valider(SchemaDevisData, req.body?.data);
  const version = Number(req.body?.version);
  const u = req.ctx.utilisateur;
  return transaction(db, () => {
    const row = db.prepare('SELECT version, modifie_par, modifie_le FROM devis WHERE id = ? AND supprime = 0').get(req.params.id) as any;
    if (!row) throw new HttpError(404, 'Devis introuvable.');
    if (row.version !== version) {
      throw new HttpError(409, 'Ce devis a été modifié entre-temps par quelqu’un d’autre.', {
        modifiePar: nomUtilisateur(row.modifie_par), modifieLe: row.modifie_le, version: row.version,
      });
    }
    const t = maintenant();
    db.prepare(`UPDATE devis SET titre = ?, client = ?, reference = ?, data = ?, version = version + 1, modifie_par = ?, modifie_le = ? WHERE id = ?`)
      .run(e.titre, e.client, e.reference, JSON.stringify(data), u.id, t, req.params.id);
    return { json: { version: version + 1, updatedAt: t, updatedBy: u.nom } };
  });
});

r.post('/api/devis/:id/dupliquer', exigerConnexion, (req) => {
  const d = lireDevis(req.params.id);
  const u = req.ctx.utilisateur.id; const did = id(); const t = maintenant();
  db.prepare(`INSERT INTO devis (id, titre, client, reference, lot, version, data, cree_par, modifie_par, cree_le, modifie_le)
              VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`)
    .run(did, `${d.titre} (copie)`.slice(0, 200), d.client, '', d.lot, JSON.stringify(d.data), u, u, t, t);
  return { status: 201, json: lireDevis(did) };
});

r.delete('/api/devis/:id', exigerConnexion, (req) => {
  const row = db.prepare('SELECT cree_par FROM devis WHERE id = ? AND supprime = 0').get(req.params.id) as any;
  if (!row) throw new HttpError(404, 'Devis introuvable.');
  const u = req.ctx.utilisateur;
  if (row.cree_par !== u.id && u.role !== 'admin') throw new HttpError(403, 'Seul l’auteur du devis ou un administrateur peut le supprimer.');
  db.prepare('UPDATE devis SET supprime = 1, modifie_par = ?, modifie_le = ? WHERE id = ?').run(u.id, maintenant(), req.params.id);
  return { json: { ok: true } };
});

r.post('/api/devis/:id/presence', exigerConnexion, (req) => {
  const u = req.ctx.utilisateur;
  if (!presence.has(req.params.id)) presence.set(req.params.id, new Map());
  presence.get(req.params.id)!.set(u.id, { nom: u.nom, vu: Date.now() });
  return { json: { presents: presents(req.params.id, u.id) } };
});

r.get('/api/devis/:id/export', exigerConnexion, async (req) => {
  const d = lireDevis(req.params.id);
  const lot = LOTS[d.lot] ?? LOTS.cfo;
  const res = lot.calculer(d.data, parametres(d.lot));
  const erreurs = res.alertes.filter((a) => a.niveau === 'erreur');
  if (erreurs.length) throw new HttpError(422, 'Le devis contient des erreurs à corriger avant l’export.', erreurs);
  const buf = await fichierImport(d, res);
  const nom = nomFichier(d);
  return {
    body: buf,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nom.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
    },
  };
});

// ---------- paramètres (lecture : tous ; écriture : admin)
r.get('/api/parametres', exigerConnexion, () => ({ json: parametres() }));
r.put('/api/parametres', exigerAdmin, (req) => {
  const p = valider(SchemaParametres, req.body);
  db.prepare('INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
    .run('lot:cfo', JSON.stringify(p));
  return { json: parametres() };
});

// ---------- utilisateurs (admin)
function adminsActifs(sauf?: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM utilisateurs WHERE role = 'admin' AND actif = 1 AND id != ?").get(sauf ?? '') as any).n;
}

r.get('/api/utilisateurs', exigerAdmin, () => ({ json: listerUtilisateurs(db) }));

r.post('/api/utilisateurs', exigerAdmin, (req) => {
  const { login, nom, motDePasse, role } = req.body ?? {};
  if (typeof login !== 'string' || !/^[\w.@-]{2,40}$/.test(login.trim())) throw new HttpError(400, 'Identifiant invalide (lettres, chiffres, . _ - @).');
  if (trouverParLogin(db, login.trim())) throw new HttpError(409, 'Cet identifiant existe déjà.');
  controlerMotDePasse(motDePasse);
  db.prepare('INSERT INTO utilisateurs (id, login, nom, role, actif, hash, cree_le) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .run(id(), login.trim(), String(nom || login).trim().slice(0, 80), role === 'admin' ? 'admin' : 'user', hacher(motDePasse), maintenant());
  return { status: 201, json: listerUtilisateurs(db) };
});

r.put('/api/utilisateurs/:id', exigerAdmin, (req) => {
  const cible = db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(req.params.id) as any;
  if (!cible) throw new HttpError(404, 'Utilisateur introuvable.');
  const { nom, role, actif, motDePasse } = req.body ?? {};
  const nouveauRole = role === 'admin' || role === 'user' ? role : cible.role;
  const nouvelActif = typeof actif === 'boolean' ? (actif ? 1 : 0) : cible.actif;
  if (cible.role === 'admin' && (nouveauRole !== 'admin' || !nouvelActif) && adminsActifs(cible.id) === 0) {
    throw new HttpError(400, 'Il faut garder au moins un administrateur actif.');
  }
  transaction(db, () => {
    db.prepare('UPDATE utilisateurs SET nom = ?, role = ?, actif = ? WHERE id = ?')
      .run(typeof nom === 'string' && nom.trim() ? nom.trim().slice(0, 80) : cible.nom, nouveauRole, nouvelActif, cible.id);
    if (motDePasse) db.prepare('UPDATE utilisateurs SET hash = ? WHERE id = ?').run(hacher(controlerMotDePasse(motDePasse)), cible.id);
    if (!nouvelActif || motDePasse) db.prepare('DELETE FROM sessions WHERE utilisateur_id = ?').run(cible.id);
  });
  return { json: listerUtilisateurs(db) };
});

// ---------- démarrage
setInterval(() => db.prepare('DELETE FROM sessions WHERE expire_le < ?').run(Date.now()), 3600_000).unref();

const serveur = r.serveur(PUBLIC);
serveur.on('error', (e: NodeJS.ErrnoException) => {
  console.error(e.code === 'EADDRINUSE' ? `Le port ${PORT} est déjà utilisé : changer la variable PORT.` : e);
  process.exit(1);
});
serveur.listen(PORT, HOTE, () => {
  console.log(`LAPELEC Devis ${VERSION} — http://${HOTE === '0.0.0.0' ? 'localhost' : HOTE}:${PORT}  (données : ${DONNEES})`);
});
const arreter = () => { serveur.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', arreter);
process.on('SIGINT', arreter);

export type { Req };
