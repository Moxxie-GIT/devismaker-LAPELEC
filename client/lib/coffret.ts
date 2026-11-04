// Disposition d'un tableau sur ses rails DIN : partagée par le schéma 2D et la vue 3D.
import type { TableauCalcule } from '../../shared/types';
import { MODULES_PROTECTION, TABLEAUX } from '../../shared/lots/cfo/catalogue';

export const PAR_RANGEE = 13;

const REPERE: Record<string, string> = { C10: 'C10', C16: 'C16', C20: 'C20', C32: 'C32', D32: 'C32\n300mA', D40: 'C40\n300mA', IDAC: 'ID\nAC', IDA: 'ID\nA' };
const ORDRE = ['IDAC', 'IDA', 'D32', 'D40', 'C10', 'C16', 'C20', 'C32'];

export type EtatModule = '' | 'ajoute' | 'inutile' | 'fixe' | 'libre';
export interface Mod { cle: string; rep: string; nom: string; ref?: string; largeur: number; etat: EtatModule }

export const LIBELLE_ETAT: Record<EtatModule, string> = {
  '': 'Inclus dans l’ensemble',
  ajoute: 'À ajouter dans l’ensemble',
  inutile: 'Facturé, non utilisé',
  fixe: 'Appareil fixe de l’ensemble',
  libre: 'Emplacement libre',
};

export function modules(t: TableauCalcule): Mod[] {
  const m = TABLEAUX[t.modele];
  const out: Mod[] = (m?.fixes ?? []).map((f) => ({ cle: 'fixe', rep: f.label, nom: f.label, largeur: f.modules, etat: 'fixe' as const }));
  for (const k of ORDRE) {
    const p = t.protections.find((x) => x.cle === k);
    if (!p) continue;
    for (let i = 0; i < p.final; i++) {
      const etat: EtatModule = i >= p.base ? 'ajoute' : i >= p.besoin ? 'inutile' : '';
      out.push({ cle: k, rep: REPERE[k] ?? k, nom: p.label, ref: p.ref, largeur: MODULES_PROTECTION[k] ?? 1, etat });
    }
  }
  return out;
}

/** Range les modules par rails de 13 ; complète avec des emplacements libres si la capacité du coffret est connue. */
export function rangees(mods: Mod[], capacite?: number): Mod[][] {
  const r: Mod[][] = [];
  let cur: Mod[] = []; let n = 0;
  for (const m of mods) {
    if (n + m.largeur > PAR_RANGEE) { r.push(cur); cur = []; n = 0; }
    cur.push(m); n += m.largeur;
  }
  if (cur.length) r.push(cur);
  if (capacite) {
    const nbR = Math.max(Math.ceil(capacite / PAR_RANGEE), r.length);
    while (r.length < nbR) r.push([]);
    for (const ligne of r) {
      let l = ligne.reduce((a, m) => a + m.largeur, 0);
      while (l < PAR_RANGEE) { ligne.push({ cle: 'libre', rep: '', nom: '', largeur: 1, etat: 'libre' }); l++; }
    }
  }
  return r;
}

export function disposition(t: TableauCalcule) {
  const cap = TABLEAUX[t.modele]?.capacite;
  const mods = modules(t);
  const utilises = mods.reduce((a, x) => a + x.largeur, 0);
  return { mods, rangees: rangees(mods, cap), utilises, capacite: cap, pct: cap ? Math.round((utilises / cap) * 100) : 0 };
}
