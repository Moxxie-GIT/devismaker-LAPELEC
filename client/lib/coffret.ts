// Disposition d'un tableau sur ses rails DIN : partagée par le schéma 2D et la vue 3D.
// La taille du coffret (rangées × modules par rangée) et les appareils fixes viennent du contenu de l'ensemble Esabora.
import type { TableauCalcule } from '../../shared/types';
import { MODULES_PROTECTION, TABLEAUX, placesCoffret, type AppareilFixe } from '../../shared/lots/cfo/catalogue';

/** Largeur de rangée quand l'ensemble n'a pas de coffret connu. */
export const PAR_RANGEE_DEFAUT = 13;

const REPERE: Record<string, string> = {
  C10: 'C10', C16: 'C16', C20: 'C20', C32: 'C32', D32: 'C32\n300mA', D40: 'C40\n300mA', IDAC: 'ID\nAC', IDA: 'ID\nA',
  DD4_C10_AC30: 'C10 4P\n30mA', DD4_C16_AC30: 'C16 4P\n30mA', DD4_C32_AC30: 'C32 4P\n30mA',
  DD4_C10_AC300: 'C10 4P\n300mA', DD4_C16_A300: 'C16 4P\n300mA', DD4_C20_A300: 'C20 4P\n300mA', DD4_C32_AC300: 'C32 4P\n300mA',
};
const ORDRE = [
  'IDAC', 'IDA', 'D32', 'D40', 'DD4_C10_AC30', 'DD4_C16_AC30', 'DD4_C32_AC30', 'DD4_C10_AC300', 'DD4_C16_A300', 'DD4_C20_A300', 'DD4_C32_AC300',
  'C10', 'C16', 'C20', 'C32',
];

export type EtatModule = '' | 'ajoute' | 'inutile' | 'fixe' | 'libre';
export interface Mod {
  cle: string; rep: string; nom: string; ref?: string; largeur: number; etat: EtatModule;
  /** Pour les appareils fixes : interrupteur-sectionneur, télérupteur, répartiteur… */
  type?: AppareilFixe['type'];
  /** Ce que protège ce disjoncteur (« Éclairage Salon, Cuisine », « Plaque de cuisson (Cuisine) »…), pour l'étiquette. */
  fonctions?: string[];
}

export const LIBELLE_ETAT: Record<EtatModule, string> = {
  '': 'Inclus dans l’ensemble',
  ajoute: 'À ajouter dans l’ensemble',
  inutile: 'Facturé, non utilisé',
  fixe: 'Appareil fixe de l’ensemble',
  libre: 'Emplacement libre',
};

const fixe = (f: AppareilFixe): Mod => ({ cle: 'fixe', type: f.type, rep: f.label, nom: f.nom, ref: f.ref, largeur: f.modules, etat: 'fixe' });

export function modules(t: TableauCalcule): Mod[] {
  const m = TABLEAUX[t.modele];
  const out: Mod[] = (m?.fixes ?? []).filter((f) => !f.fin).map(fixe);
  for (const k of ORDRE) {
    const p = t.protections.find((x) => x.cle === k);
    if (!p) continue;
    for (let i = 0; i < p.final; i++) {
      const etat: EtatModule = i >= p.base ? 'ajoute' : i >= p.besoin ? 'inutile' : '';
      // les « besoin » premiers disjoncteurs ont une fonction ; au-delà, ils sont facturés mais en réserve
      const fonctions = i < p.besoin ? t.departs?.[k]?.[i] : undefined;
      out.push({ cle: k, rep: REPERE[k] ?? k, nom: p.label, ref: p.ref, largeur: MODULES_PROTECTION[k] ?? 1, etat, fonctions });
    }
  }
  out.push(...(m?.fixes ?? []).filter((f) => f.fin).map(fixe));
  return out;
}

/** Range les modules par rails ; complète avec des emplacements libres jusqu'au nombre de rangées du coffret. */
export function rangees(mods: Mod[], parRangee: number, nbRangees?: number): Mod[][] {
  const r: Mod[][] = [];
  let cur: Mod[] = []; let n = 0;
  for (const m of mods) {
    if (n + m.largeur > parRangee && cur.length) { r.push(cur); cur = []; n = 0; }
    cur.push(m); n += m.largeur;
  }
  if (cur.length) r.push(cur);
  if (nbRangees) {
    while (r.length < nbRangees) r.push([]);
    for (const ligne of r) {
      let l = ligne.reduce((a, m) => a + m.largeur, 0);
      while (l < parRangee) { ligne.push({ cle: 'libre', rep: '', nom: '', largeur: 1, etat: 'libre' }); l++; }
    }
  }
  return r;
}

export function disposition(t: TableauCalcule) {
  const m = TABLEAUX[t.modele];
  const coffret = m?.coffret;
  const parRangee = coffret?.parRangee ?? PAR_RANGEE_DEFAUT;
  const places = m ? placesCoffret(m) : undefined;
  const mods = modules(t);
  const utilises = mods.reduce((a, x) => a + x.largeur, 0);
  return {
    mods, rangees: rangees(mods, parRangee, coffret?.rangees), utilises, parRangee, coffret,
    capacite: places, pct: places ? Math.round((utilises / places) * 100) : 0,
  };
}
