// Comptes, mots de passe (scrypt) et sessions par cookie.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DB } from './db';
import { HttpError, type Req } from './http';
import type { Utilisateur } from '../shared/types';

export const COOKIE = 'lapelec_sid';
const DUREE_SESSION = 30 * 24 * 3600 * 1000;

export function hacher(mdp: string): string {
  const sel = randomBytes(16);
  const h = scryptSync(mdp, sel, 64, { N: 16384, r: 8, p: 1 });
  return `s1$${sel.toString('base64')}$${h.toString('base64')}`;
}

export function verifier(mdp: string, stocke: string): boolean {
  const [v, sel, h] = stocke.split('$');
  if (v !== 's1' || !sel || !h) return false;
  const attendu = Buffer.from(h, 'base64');
  const calcule = scryptSync(mdp, Buffer.from(sel, 'base64'), attendu.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(attendu, calcule);
}

export function controlerMotDePasse(mdp: unknown): string {
  if (typeof mdp !== 'string' || mdp.length < 8) throw new HttpError(400, 'Le mot de passe doit faire au moins 8 caractères.');
  if (mdp.length > 200) throw new HttpError(400, 'Mot de passe trop long.');
  return mdp;
}

const versUtilisateur = (r: any): Utilisateur => ({ id: r.id, login: r.login, nom: r.nom, role: r.role, actif: !!r.actif });

export function creerSession(db: DB, utilisateurId: string): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token, utilisateur_id, expire_le) VALUES (?, ?, ?)').run(token, utilisateurId, Date.now() + DUREE_SESSION);
  return token;
}

export function cookieSession(token: string, securise: boolean, effacer = false): string {
  const parts = [`${COOKIE}=${effacer ? '' : token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${effacer ? 0 : DUREE_SESSION / 1000}`];
  if (securise) parts.push('Secure');
  return parts.join('; ');
}

export function utilisateurDeSession(db: DB, token: string | undefined): Utilisateur | null {
  if (!token) return null;
  const r = db.prepare(`SELECT u.*, s.expire_le FROM sessions s JOIN utilisateurs u ON u.id = s.utilisateur_id WHERE s.token = ?`).get(token) as any;
  if (!r) return null;
  if (r.expire_le < Date.now() || !r.actif) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  // prolongation glissante
  if (r.expire_le - Date.now() < DUREE_SESSION / 2) {
    db.prepare('UPDATE sessions SET expire_le = ? WHERE token = ?').run(Date.now() + DUREE_SESSION, token);
  }
  return versUtilisateur(r);
}

export function trouverParLogin(db: DB, login: string): (Utilisateur & { hash: string }) | null {
  const r = db.prepare('SELECT * FROM utilisateurs WHERE login = ?').get(login) as any;
  return r ? { ...versUtilisateur(r), hash: r.hash } : null;
}

export function listerUtilisateurs(db: DB): Utilisateur[] {
  return (db.prepare('SELECT * FROM utilisateurs ORDER BY nom COLLATE NOCASE').all() as any[]).map(versUtilisateur);
}

export function nombreUtilisateurs(db: DB): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM utilisateurs').get() as any).n;
}

// ---- limitation des tentatives de connexion (mémoire)
const echecs = new Map<string, { n: number; depuis: number }>();
const FENETRE = 15 * 60 * 1000;

export function verifierLimite(cle: string) {
  const e = echecs.get(cle);
  if (e && Date.now() - e.depuis < FENETRE && e.n >= 10) {
    throw new HttpError(429, 'Trop de tentatives. Réessaie dans un quart d’heure.');
  }
}
export function noterEchec(cle: string) {
  const e = echecs.get(cle);
  if (!e || Date.now() - e.depuis > FENETRE) echecs.set(cle, { n: 1, depuis: Date.now() });
  else e.n += 1;
}
export function effacerEchecs(cle: string) { echecs.delete(cle); }

// ---- garde-fous des routes
export function exigerConnexion(req: Req) {
  if (!req.ctx.utilisateur) throw new HttpError(401, 'Connexion requise.');
}
export function exigerAdmin(req: Req) {
  exigerConnexion(req);
  if (req.ctx.utilisateur.role !== 'admin') throw new HttpError(403, 'Réservé aux administrateurs.');
}
