// Base de données SQLite intégrée à Node (aucune dépendance externe).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type DB = DatabaseSync;

export function ouvrirBase(dossier: string): DB {
  mkdirSync(dossier, { recursive: true });
  const db = new DatabaseSync(join(dossier, 'devis.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS utilisateurs (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL UNIQUE COLLATE NOCASE,
      nom TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      actif INTEGER NOT NULL DEFAULT 1,
      hash TEXT NOT NULL,
      cree_le TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      expire_le INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devis (
      id TEXT PRIMARY KEY,
      titre TEXT NOT NULL,
      client TEXT NOT NULL DEFAULT '',
      reference TEXT NOT NULL DEFAULT '',
      lot TEXT NOT NULL DEFAULT 'cfo',
      version INTEGER NOT NULL DEFAULT 1,
      data TEXT NOT NULL,
      cree_par TEXT NOT NULL,
      modifie_par TEXT NOT NULL,
      cree_le TEXT NOT NULL,
      modifie_le TEXT NOT NULL,
      supprime INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS parametres (
      cle TEXT PRIMARY KEY,
      valeur TEXT NOT NULL
    );
  `);
  return db;
}

/** Exécute fn dans une transaction. */
export function transaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
