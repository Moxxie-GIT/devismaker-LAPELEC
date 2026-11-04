// Disposition d'un tableau sur ses rails DIN, partagée par le moteur (contrôles), l'export et l'interface (2D / 3D).
// Règles : chaque interrupteur différentiel est suivi des disjoncteurs qu'il protège (8 au plus, calculés par le
// moteur dans « groupes ») ; un groupe ne se coupe jamais entre deux rangées ; les appareils fixes de tête
// (interrupteur-sectionneur, répartiteur…) ouvrent la première rangée, les borniers ferment le tableau.
import type { TableauCalcule } from '../../types';
import { MODULES_KNX, MODULES_PROTECTION, ORDRE_KNX, TABLEAUX, placesCoffret, type AppareilFixe } from './catalogue';

/** Largeur de rangée quand l'ensemble n'a pas de coffret connu. */
export const PAR_RANGEE_DEFAUT = 13;

export const REPERE: Record<string, string> = {
  C10: 'C10', C16: 'C16', C20: 'C20', C32: 'C32', D32: 'C32\n300mA', D40: 'C40\n300mA', IDAC: 'ID\nAC', IDA: 'ID\nA',
  DD4_C10_AC30: 'C10 4P\n30mA', DD4_C16_AC30: 'C16 4P\n30mA', DD4_C32_AC30: 'C32 4P\n30mA',
  DD4_C10_AC300: 'C10 4P\n300mA', DD4_C16_A300: 'C16 4P\n300mA', DD4_C20_A300: 'C20 4P\n300mA', DD4_C32_AC300: 'C32 4P\n300mA',
};
const ORDRE = [
  'IDAC', 'IDA', 'D32', 'D40', 'DD4_C10_AC30', 'DD4_C16_AC30', 'DD4_C32_AC30', 'DD4_C10_AC300', 'DD4_C16_A300', 'DD4_C20_A300', 'DD4_C32_AC300',
  'C10', 'C16', 'C20', 'C32',
];

export type EtatModule = '' | 'ajoute' | 'inutile' | 'fixe' | 'libre' | 'knx';
export interface Mod {
  cle: string; rep: string; nom: string; ref?: string; largeur: number; etat: EtatModule;
  /** Pour les appareils fixes : interrupteur-sectionneur, télérupteur, répartiteur… */
  type?: AppareilFixe['type'];
  /** Ce que protège ce disjoncteur (« Éclairage Salon, Cuisine »…) ; pour un ID : son nom et son nombre de circuits. */
  fonctions?: string[];
  /** Interrupteur différentiel qui protège ce disjoncteur (« Différentiel 2 »). */
  groupe?: string;
  /** Module KNX : sa clé (RM8, ALIM…). */
  knx?: string;
}

export const LIBELLE_ETAT: Record<EtatModule, string> = {
  '': 'Inclus dans l’ensemble',
  ajoute: 'À ajouter dans l’ensemble',
  inutile: 'Facturé, non utilisé',
  fixe: 'Appareil fixe de l’ensemble',
  libre: 'Emplacement libre',
  knx: 'Module KNX (facturé dans le bloc Domotique)',
};

/** Modules KNX du tableau, avec le nombre de sorties utilisées sur chacun (remplis dans l'ordre, les plus gros d'abord). */
function modulesKnx(t: TableauCalcule): Mod[] {
  const out: Mod[] = [];
  const reste: Record<string, number> = { ...t.canaux };
  for (const k of ORDRE_KNX) {
    const def = MODULES_KNX[k];
    for (let i = 0; i < (t.modules?.[k] ?? 0); i++) {
      let fonctions: string[] | undefined;
      if (def.sorties && def.canal) {
        const pris = Math.min(def.sorties, reste[def.canal] ?? 0);
        reste[def.canal] = (reste[def.canal] ?? 0) - pris;
        fonctions = [`${pris} / ${def.sorties} sorties`];
      }
      out.push({ cle: 'knx', rep: def.label, nom: def.nom, largeur: def.modules, etat: 'knx', fonctions, knx: k });
    }
  }
  return out;
}

const fixe = (f: AppareilFixe): Mod => ({ cle: 'fixe', type: f.type, rep: f.label, nom: f.nom, ref: f.ref, largeur: f.modules, etat: 'fixe' });

/** Le i-ème appareil d'une protection (0 = premier) : déjà dans l'ensemble, à ajouter, ou facturé en réserve. */
function appareil(t: TableauCalcule, k: string, i: number): Mod {
  const p = t.protections.find((x) => x.cle === k)!;
  const etat: EtatModule = i >= p.base ? 'ajoute' : i >= p.besoin ? 'inutile' : '';
  const fonctions = i < p.besoin ? t.departs?.[k]?.[i] : undefined;
  return { cle: k, rep: REPERE[k] ?? k, nom: p.label, ref: p.ref, largeur: MODULES_PROTECTION[k] ?? 1, etat, fonctions };
}

/** Suites d'appareils à poser d'un seul tenant sur un rail. */
function blocs(t: TableauCalcule): Mod[][] {
  const m = TABLEAUX[t.modele];
  const out: Mod[][] = (m?.fixes ?? []).filter((f) => !f.fin).map((f) => [fixe(f)]);
  if (t.groupes?.length) {
    for (const g of t.groupes) {
      const suite: Mod[] = [];
      if (g.tete) {
        const id = appareil(t, g.tete.cle, g.tete.i);
        const actifs = g.membres.filter((x) => x.i < (t.protections.find((p) => p.cle === x.cle)?.besoin ?? 0)).length;
        id.fonctions = [g.libelle, `${actifs} circuit${actifs > 1 ? 's' : ''}`];
        suite.push(id);
      }
      for (const x of g.membres) suite.push({ ...appareil(t, x.cle, x.i), groupe: g.tete ? g.libelle : undefined });
      if (suite.length) out.push(suite);
    }
  } else {
    // tableau non calculé : contenu de l'ensemble dans l'ordre du catalogue
    for (const k of ORDRE) {
      const p = t.protections.find((x) => x.cle === k);
      for (let i = 0; i < (p?.final ?? 0); i++) out.push([appareil(t, k, i)]);
    }
  }
  // modules KNX : sur leurs propres rangées (ils ne se branchent pas sur les peignes des différentiels)
  const knx = modulesKnx(t).map((x) => [x]);
  if (knx.length) NOUVELLE_RANGEE.add(knx[0]);
  out.push(...knx);
  out.push(...(m?.fixes ?? []).filter((f) => f.fin).map((f) => [fixe(f)]));
  return out;
}

/** Suites qui doivent ouvrir une nouvelle rangée. */
const NOUVELLE_RANGEE = new WeakSet<Mod[]>();

export function disposer(t: TableauCalcule) {
  const m = TABLEAUX[t.modele];
  const coffret = m?.coffret;
  const parRangee = coffret?.parRangee ?? PAR_RANGEE_DEFAUT;
  const places = m ? placesCoffret(m) : undefined;

  // une suite va sur la rangée en cours si elle y tient entière, sinon elle ouvre une nouvelle rangée.
  // Un peigne horizontal (13 appareils) alimente une rangée depuis son interrupteur différentiel : un seul ID par
  // rangée dans les coffrets de 13 ou 18 modules, deux dans les rangées de 24 (deux peignes).
  const maxIdParRangee = parRangee >= 24 ? 2 : 1;
  const coffrets = coffret ? Math.max(1, t.coffrets ?? 1) : 1;
  const rangees: Mod[][] = [];
  let cur: Mod[] = []; let n = 0; let ids = 0;
  const nouvelle = () => { if (cur.length) rangees.push(cur); cur = []; n = 0; ids = 0; };
  const suites = blocs(t);
  for (const [s, suite] of suites.entries()) {
    const w = suite.reduce((a, x) => a + x.largeur, 0);
    const avecId = suite[0]?.cle.startsWith('ID');
    if (NOUVELLE_RANGEE.has(suite) && coffret && coffrets > 1) {
      // deux coffrets : les modules KNX restent ensemble ; s'ils ne tiennent pas dans ce qu'il reste du coffret en
      // cours, ils passent tous dans le suivant
      nouvelle();
      const knx = suites.slice(s).filter((x) => x[0].etat === 'knx').flat();
      let lignesKnx = 1, l = 0;
      for (const x of knx) { if (l + x.largeur > parRangee) { lignesKnx++; l = 0; } l += x.largeur; }
      const R = coffret.rangees;
      const restantes = R - (rangees.length % R || (rangees.length ? R : 0));
      if (lignesKnx > restantes && Math.floor(rangees.length / R) + 1 < coffrets) while (rangees.length % R) rangees.push([]);
    }
    if (n + w > parRangee || (avecId && ids >= maxIdParRangee) || NOUVELLE_RANGEE.has(suite)) nouvelle();
    if (avecId) ids++;
    for (const x of suite) {
      if (n + x.largeur > parRangee) nouvelle();      // suite plus large qu'une rangée : seul cas où l'on coupe
      cur.push(x); n += x.largeur;
    }
  }
  nouvelle();
  const rangeesUtiles = rangees.length;
  if (coffret) {
    while (rangees.length < coffret.rangees * coffrets) rangees.push([]);
    for (const r of rangees) {
      let l = r.reduce((a, x) => a + x.largeur, 0);
      while (l < parRangee) { r.push({ cle: 'libre', rep: '', nom: '', largeur: 1, etat: 'libre' }); l++; }
    }
  }
  const mods = rangees.flat().filter((x) => x.etat !== 'libre');
  const utilises = mods.reduce((a, x) => a + x.largeur, 0);
  const capacite = places ? places * coffrets : undefined;
  return {
    mods, rangees, rangeesUtiles, utilises, parRangee, coffret, coffrets,
    /** Coffret (0 = premier) d'une rangée. */
    coffretDe: (i: number) => (coffret ? Math.floor(i / coffret.rangees) : 0),
    capacite, pct: capacite ? Math.round((utilises / capacite) * 100) : 0,
  };
}
