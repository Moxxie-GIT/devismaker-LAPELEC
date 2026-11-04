// Moteur de calcul du lot CFO : devis saisi -> lignes d'import Esabora + calculs tableaux / domotique.
import type {
  Alerte, DevisData, LigneImport, Parametres, Piece, Protection, Resultat, TableauCalcule,
} from '../../types';
import {
  ALIM_TD, CATALOGUE, MODULES_PROTECTION, NOTE_ML, HEURES_POSE, ORDRE_DOMOTIQUE, ORDRE_PROTECTIONS, PROTECTIONS, TABLEAUX,
  PROTECTION_TRI, placesCoffret, type ModeleTableau,
} from './catalogue';
import { TYPES_PIECES } from './pieces';

const MODULES_CANAL: Record<string, string> = { v110: 'SM4', v230: 'DM4T', dali: 'DALI', jm: 'JM4T' };
const RESERVES = ['domotique', 'divers'];

/** 1-2 boutons -> TA2 ; 3-4 -> TA4 ; 5-6 -> TA4+TA2 ; 7-8 -> 2 TA4... jamais de TA6 ni TA8. */
export function modulesPourInter(boutons: number): Record<string, number> {
  const r: Record<string, number> = { TA4: Math.floor(boutons / 4), TA2: 0 };
  const reste = boutons % 4;
  if (reste === 1 || reste === 2) r.TA2 += 1;
  else if (reste === 3) r.TA4 += 1;
  return r;
}

/** Combinaison minimale de RM 4 / 8 / 16 pour n canaux on/off. */
export function modulesOnOff(n: number): Record<string, number> {
  const r: Record<string, number> = {};
  const add = (k: string) => { r[k] = (r[k] ?? 0) + 1; };
  while (n > 16) { add('RM16'); n -= 16; }
  if (n === 0) return r;
  if (n <= 4) add('RM4');
  else if (n <= 8) add('RM8');
  else if (n <= 12) { add('RM8'); add('RM4'); }
  else add('RM16');
  return r;
}

const ceil = (a: number, b: number) => Math.ceil(a / b);

/** Nom court d'un équipement pour l'étiquette du tableau : « Alimentation plaque de cuisson » → « Plaque de cuisson ». */
export function nomCourt(designation: string): string {
  const d = designation.trim();
  const parenthese = /\(([^)]+)\)\s*$/.exec(d);
  if (/^prise/i.test(d) && parenthese) return `Prise ${parenthese[1].trim()}`;
  const s = d.replace(/^alimentation\s+/i, '')
    .replace(/\b\d+\s*g\s*\d+\s*mm²?/gi, '')
    .replace(/\b2P\+T\b/gi, '')
    .replace(/\b(220|230|400)\s*v\b/gi, '')
    .replace(/\bavec coupure\b/gi, '')
    .replace(/\s{2,}/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : d;
}

interface Charge { quoi: string; piece: string; n: number }

/** Répartit des charges sur des disjoncteurs de « taille » unités (8 points, 12 socles…) et nomme chaque départ. */
function paquets(charges: Charge[], taille: number): { fonctions: string[]; n: number }[] {
  const out: { fonctions: string[]; n: number }[] = [];
  let cur: Charge[] = []; let place = taille;
  const fermer = () => {
    if (!cur.length) return;
    const parQuoi = new Map<string, string[]>();
    for (const c of cur) {
      const l = parQuoi.get(c.quoi) ?? [];
      if (!l.includes(c.piece)) l.push(c.piece);
      parQuoi.set(c.quoi, l);
    }
    out.push({ fonctions: [...parQuoi].map(([quoi, pieces]) => `${quoi} ${pieces.join(', ')}`), n: taille - place });
    cur = []; place = taille;
  };
  for (const c of charges) {
    let n = c.n;
    while (n > 0) {
      const pris = Math.min(n, place);
      cur.push({ ...c, n: pris }); n -= pris; place -= pris;
      if (place === 0) fermer();
    }
  }
  fermer();
  return out;
}

// ---- répartition des charges sur les phases (tableaux tétra)
// Puissances estimées, seulement pour équilibrer les phases entre elles (pas un bilan de puissance).
const KW = {
  point: 0.1,          // par point lumineux
  socle: 0.15,         // par socle de prise de service
  vr: 0.15,            // par volet, store, ventilateur…
  dedie: { C10: 0.5, C16: 2, C20: 2, C32: 6 } as Record<string, number>,
  diversiteTd: 0.6,    // un TD monophasé alimenté par le TGBT : sa charge totale × ce coefficient
};
export type Phase = 'L1' | 'L2' | 'L3';
const PHASES: Phase[] = ['L1', 'L2', 'L3'];

/** Un départ monophasé (1P+N) : ses fonctions, sa charge estimée, et la phase choisie en tétra. */
interface Depart { cle: string; fonctions: string[]; kw: number; typeA: boolean; sousId: boolean; phase?: Phase }

/**
 * Répartit les départs monophasés sur les 3 phases : du plus chargé au moins chargé, chacun sur la phase
 * la moins chargée à ce moment-là. Les appareils 400 V chargent déjà les 3 phases à parts égales.
 */
function repartir(departs: Depart[], chargeTri: number): Record<Phase, number> {
  const charge: Record<Phase, number> = { L1: chargeTri / 3, L2: chargeTri / 3, L3: chargeTri / 3 };
  const ordre = departs.map((d, i) => ({ d, i })).sort((a, b) => b.d.kw - a.d.kw || a.i - b.i);
  for (const { d } of ordre) {
    const p = PHASES.reduce((m, x) => (charge[x] < charge[m] ? x : m), 'L1' as Phase);
    d.phase = p; charge[p] += d.kw;
  }
  return charge;
}

interface TableauInterne {
  id: string; nom: string; bloc: string; pieceId: string; modele: ModeleTableau; modeleCle: string; section: 6 | 10; phase: 'mono' | 'tetra';
  points: number; socles: number; vr: number; nA: number; ded: Record<string, number>;
  rattachees: string[]; detail: string[]; canaux: Record<string, number>;
  // ce que protège chaque départ, pour les étiquettes du tableau
  fn: {
    lum: Charge[]; soc: Charge[]; vr: Charge[];
    ded: Record<string, { libelle: string; kw: number; typeA: boolean }[]>;
    tri: { libelle: string; cle: string; kw: number }[];          // appareils 400 V (tableaux tétra)
  };
}

export function calculer(data: DevisData, params: Parametres): Resultat {
  const alertes: Alerte[] = [];
  const err = (message: string, pieceId?: string) => alertes.push({ niveau: 'erreur', message, pieceId });
  const att = (message: string, pieceId?: string) => alertes.push({ niveau: 'attention', message, pieceId });
  const knx = data.mode === 'KNX';
  const pieces = data.pieces;

  // ---------- contrôles de cohérence
  const vus = new Map<string, string>();
  for (const p of pieces) {
    const n = p.nom.trim();
    if (!n) { err('Une pièce n’a pas de nom.', p.id); continue; }
    if (RESERVES.includes(n.toLowerCase())) err(`« ${n} » est réservé au bloc ${n} : choisis un autre nom de pièce.`, p.id);
    const k = n.toLowerCase();
    if (vus.has(k)) err(`Deux pièces s’appellent « ${n} » : leurs blocs fusionneraient dans Esabora.`, p.id);
    vus.set(k, p.id);
    if (!p.tableau.choix) err(`${n} : indique s’il y a un TD dans la pièce.`, p.id);
  }
  const tgbts = pieces.filter((p) => p.tableau.choix === 'TGBT');
  if (pieces.length && tgbts.length === 0) err('Aucune pièce ne porte le TGBT (en général le local technique).');
  if (tgbts.length > 1) err(`Plusieurs pièces portent un TGBT : ${tgbts.map((p) => p.nom).join(', ')}.`);

  // ---------- tableaux
  const tableaux = new Map<string, TableauInterne>();
  const creerTableau = (id: string, nom: string, p: Piece, modeleCle: string): TableauInterne => ({
    id, nom, bloc: p.nom.trim(), pieceId: p.id, modele: TABLEAUX[modeleCle], modeleCle, section: p.tableau.section, phase: p.tableau.phase,
    points: 0, socles: 0, vr: 0, nA: 0, ded: {}, rattachees: [], detail: [], canaux: {},
    fn: { lum: [], soc: [], vr: [], ded: {}, tri: [] },
  });
  if (tgbts[0]) {
    const p = tgbts[0];
    tableaux.set('TGBT', creerTableau('TGBT', 'TGBT', p, p.tableau.phase === 'tetra' ? 'TGBT_TETRA' : 'TGBT_MONO'));
  }
  for (const p of pieces) {
    if (p.tableau.choix !== 'TD') continue;
    const plomb = p.tableau.modele === 'plomberie';
    const cle = p.tableau.phase === 'tetra' ? (plomb ? 'TD_PLOMB_TETRA' : 'TD_TETRA') : (plomb ? 'TD_PLOMB' : 'TD_MONO');
    tableaux.set(p.id, creerTableau(p.id, `TD ${p.nom.trim()}`, p, cle));
  }
  const tableauDe = (p: Piece): TableauInterne | undefined => {
    if (p.tableau.choix === 'TGBT') return tableaux.get('TGBT');
    if (p.tableau.choix === 'TD') return tableaux.get(p.id);
    const t = tableaux.get(p.tableau.alimentePar);
    if (!t && p.tableau.choix === 'AUCUN') {
      if (p.tableau.alimentePar !== 'TGBT') err(`${p.nom} : le tableau qui l’alimente n’existe plus, choisis-en un autre.`, p.id);
      return tableaux.get('TGBT');
    }
    return t;
  };

  // ---------- lignes des pièces
  const lignes: LigneImport[] = [];
  const parInter: { piece: string; inter: number; boutons: number; modules: string }[] = [];
  const liaisons: { td: string; bloc: string; index: number }[] = [];
  const ta: Record<string, number> = { TA2: 0, TA4: 0 };
  let detecteurs = 0;

  for (const p of pieces) {
    const b = p.nom.trim();
    const t = tableauDe(p);
    if (t && t.pieceId !== p.id) t.rattachees.push(b);
    const L = (ref: string | null, designation: string, quantite: number, extra: Partial<LigneImport> = {}) =>
      lignes.push({ bloc: b, ref, designation, quantite, ...extra });
    const canal = (k: string, n: number) => { if (t) t.canaux[k] = (t.canaux[k] ?? 0) + n; };

    // éclairage
    for (const c of p.circuits) {
      if (!(c.nb > 0)) continue;
      const ens = c.lieu === 'ext' ? 'ENSEPTE' : 'ENSEPTI';
      const lieu = c.lieu === 'ext' ? 'extérieur' : 'intérieur';
      const variation = knx && c.commande !== 'onoff' ? ' variation' : '';
      const nom = c.nom.trim() || 'point lumineux';
      L(ens, `Point lumineux ${lieu} (${nom})${variation}`, c.nb);
      const h = HEURES_POSE[c.pose];
      if (h != null) L('MO LUM', `Pose luminaire standard (${nom})`, c.nb, { moUnit: h });
      if (t) { t.points += c.nb; t.detail.push(`${b} : ${c.nb} point(s) ${nom}`); t.fn.lum.push({ quoi: 'Éclairage', piece: b, n: c.nb }); }
      canal(knx ? (MODULES_CANAL[c.commande] ?? 'onoff') : 'onoff', 1);
    }

    // commandes
    if (knx) {
      if (p.inters.length) L('ENSEBP', 'Bouton poussoir knx', p.inters.length);
      if (p.detecteurs > 0) { L('ENSEBP', 'Détecteur knx', p.detecteurs); detecteurs += p.detecteurs; }
      p.inters.forEach((n, i) => {
        const m = modulesPourInter(n);
        ta.TA2 += m.TA2; ta.TA4 += m.TA4;
        parInter.push({
          piece: b, inter: i + 1, boutons: n,
          modules: [m.TA4 ? `${m.TA4} × TA4` : '', m.TA2 ? `${m.TA2} × TA2` : ''].filter(Boolean).join(' + ') || '—',
        });
      });
    } else {
      if (p.classique.sa > 0) L('ENSESA', 'Interrupteur simple allumage', p.classique.sa);
      if (p.classique.vv > 0) L('ENSEVV', 'Interrupteur va et vient', p.classique.vv);
      if (p.classique.bps > 0) L('ENSEBPS', 'Interrupteur boutons poussoirs', p.classique.bps);
    }

    // équipements
    for (const e of p.elements) {
      if (!(e.quantite > 0)) continue;
      const c = CATALOGUE[e.cle];
      if (!c) { att(`${b} : équipement inconnu « ${e.cle} » ignoré.`, p.id); continue; }
      const des = e.designation.trim() || c.designation;
      L(c.code, des, e.quantite);
      if (c.poseMo1) L('MO1', c.poseDes ?? 'Pose', e.quantite, { moUnit: c.poseMo1 });
      if (c.canal) canal(knx ? c.canal === 'jm' ? 'JM4T' : 'onoff' : 'onoff', e.quantite);
      if (!t) continue;
      switch (c.protection) {
        case 'P':
          t.socles += (c.socles ?? 1) * e.quantite;
          t.fn.soc.push({ quoi: 'Prises', piece: b, n: (c.socles ?? 1) * e.quantite });
          break;
        case 'VR':
          t.vr += e.quantite;
          t.fn.vr.push({ quoi: nomCourt(des), piece: b, n: e.quantite });
          break;
        case 'TRI':
          if (t.phase === 'tetra') {
            // un disjoncteur différentiel 4P 30 mA par appareil, qui charge les 3 phases
            for (let i = 0; i < e.quantite; i++) {
              t.fn.tri.push({ libelle: `${nomCourt(des)} (${b})`, cle: PROTECTION_TRI[c.tri ?? 'C10'], kw: c.kw ?? 3 });
            }
            t.detail.push(`${b} : ${e.quantite} × ${des} (400 V)`);
          } else if (t.modele.calculable) att(`${b} : « ${des} » est en 400 V alors que ${t.nom} est monophasé.`, p.id);
          break;
        case null: break;
        default:
          t.ded[c.protection] = (t.ded[c.protection] ?? 0) + e.quantite;
          if (c.typeA) t.nA += e.quantite;
          for (let i = 0; i < e.quantite; i++) {
            (t.fn.ded[c.protection] ??= []).push({ libelle: `${nomCourt(des)} (${b})`, kw: c.kw ?? KW.dedie[c.protection] ?? 1, typeA: !!c.typeA });
          }
      }
      if (c.protection) t.detail.push(`${b} : ${e.quantite} × ${des}`);
    }

    // tableau de la pièce
    if (p.tableau.choix === 'TD') {
      const tab = tableaux.get(p.id)!;
      const alim = ALIM_TD[`${p.tableau.phase}-${p.tableau.section}`];
      L(alim.code, alim.designation, 1);
      L(tab.modele.code, tab.modele.designation, 1);
      // la liaison bus se place ici, mais on ne sait qu'à la fin si ce TD contient du KNX (voir plus bas)
      if (knx) liaisons.push({ td: p.id, bloc: b, index: lignes.length });
    } else if (p.tableau.choix === 'TGBT') {
      const tab = tableaux.get('TGBT');
      if (tab && tab.pieceId === p.id) {
        const sec = p.tableau.phase === 'tetra' ? '4X16' : '2X16';
        if (p.tableau.alimTgbt === 'edf') L('ENSEALIMEDF', `Alimentation EDF vers TGBT ${sec}mm² SOUS TPC 63mm² noir.` + NOTE_ML, 1);
        if (p.tableau.alimTgbt === 'onduleur') {
          L('ENSEALIMEDF', `Alimentation EDF vers onduleur ${sec}mm² SOUS TPC 63mm² noir.` + NOTE_ML, 1);
          L('ENSEEDFONDU', `Alimentation onduleur vers TGBT ${sec}mm² sous tpc de 63mm² noir.` + NOTE_ML, 1);
        }
        L(tab.modele.code, tab.modele.designation, 1);
      }
    }
  }

  // ---------- liaison bus KNX : une sous chaque TD qui contient du KNX, c'est-à-dire des sorties d'actionneurs
  // pour les circuits qu'il alimente (ses pièces et celles qui lui sont rattachées). Insérée de la fin vers le début
  // pour que les positions notées restent justes.
  for (const l of [...liaisons].reverse()) {
    const td = tableaux.get(l.td);
    if (td && Object.values(td.canaux).some((n) => n > 0)) {
      lignes.splice(l.index, 0, { bloc: l.bloc, ref: 'ENSELB', designation: 'Liaison bus TD vers TGBT', quantite: 1 });
    }
  }

  // ---------- domotique
  let domotique: Resultat['domotique'] = null;
  const modulesParTableau = new Map<string, Record<string, number>>();
  if (knx && data.domotique.actif) {
    const total: Record<string, number> = {};
    const ajoute = (k: string, n: number) => { if (n) total[k] = (total[k] ?? 0) + n; };
    for (const t of tableaux.values()) {
      const m = modulesOnOff(t.canaux.onoff ?? 0);
      for (const k of ['SM4', 'DM4T', 'DALI', 'JM4T']) if (t.canaux[k]) m[k] = ceil(t.canaux[k], 4);
      modulesParTableau.set(t.id, m);
      for (const [k, n] of Object.entries(m)) ajoute(k, n);
    }
    ajoute('TA2', ta.TA2); ajoute('TA4', ta.TA4);
    total.HORL = 1; total.USB = 1; total.IP = 1;
    const participants = Object.values(total).reduce((a, n) => a + n, 0) + detecteurs;
    total.ALIM = Math.max(1, ceil(participants, 64));
    const tg = tableaux.get('TGBT');
    if (tg) {
      tg.ded.C10 = (tg.ded.C10 ?? 0) + total.ALIM; tg.detail.push(`Alimentation KNX 640 mA : ${total.ALIM}`);
      for (let i = 0; i < total.ALIM; i++) {
        (tg.fn.ded.C10 ??= []).push({ libelle: total.ALIM > 1 ? `Alimentation KNX ${i + 1}` : 'Alimentation KNX', kw: 0.05, typeA: false });
      }
    }
    domotique = { modules: total, participants, parInter };
    if (data.domotique.heuresEts == null) err('Domotique : indique le nombre d’heures de programmation ETS.');
  }

  // ---------- protections par tableau
  const resTableaux: TableauCalcule[] = [];
  const aModifier: Resultat['aModifier'] = [];
  const tds = [...tableaux.values()].filter((t) => t.id !== 'TGBT');

  // départs monophasés de chaque tableau, avec leur charge estimée. Mêmes règles que le comptage :
  // 8 points ou 8 volets par C10, 12 socles par C20, un départ par équipement dédié.
  const departsDe = (t: TableauInterne): Depart[] => {
    const d = (cle: string, fonctions: string[], kw: number, typeA = false): Depart => ({ cle, fonctions, kw, typeA, sousId: true });
    const ded = (k: string) => (t.fn.ded[k] ?? []).map((x) => d(k, [x.libelle], x.kw, x.typeA));
    return [
      ...paquets(t.fn.lum, 8).map((x) => d('C10', x.fonctions, x.n * KW.point)),
      ...paquets(t.fn.vr, 8).map((x) => d('C10', x.fonctions, x.n * KW.vr)),
      ...ded('C10'),
      ...ded('C16'),
      ...paquets(t.fn.soc, 12).map((x) => d('C20', x.fonctions, x.n * KW.socle)),
      ...ded('C20'),
      ...ded('C32'),
    ];
  };
  const departsParTableau = new Map([...tableaux.values()].map((t) => [t.id, departsDe(t)]));
  const chargeTotale = (t: TableauInterne) =>
    (departsParTableau.get(t.id) ?? []).reduce((a, x) => a + x.kw, 0) + t.fn.tri.reduce((a, x) => a + x.kw, 0);

  for (const t of tableaux.values()) {
    const protections: Protection[] = [];
    const departs: Record<string, string[][]> = {};
    let nbCircuits = 0;
    let phases: Record<Phase, number> | undefined;
    const base = (k: string) => t.modele.base[k]?.q ?? 0;
    if (t.modele.calculable) {
      const tetra = t.phase === 'tetra';
      const liste = departsParTableau.get(t.id)!;
      const need: Record<string, number> = {
        C10: ceil(t.points, 8) + ceil(t.vr, 8) + (t.ded.C10 ?? 0),
        C16: t.ded.C16 ?? 0,
        C20: ceil(t.socles, 12) + (t.ded.C20 ?? 0),
        C32: t.ded.C32 ?? 0,
      };
      nbCircuits = need.C10 + need.C16 + need.C20 + need.C32;

      // TGBT : un départ 1P+N 300 mA par TD monophasé (pas sous un ID 30 mA, il a son propre différentiel)
      const versTd: Depart[] = [];
      const tdTetra = tds.filter((x) => x.phase === 'tetra');
      if (t.id === 'TGBT') {
        for (const [k, section] of [['D32', 6], ['D40', 10]] as const) {
          const liste6ou10 = tds.filter((x) => x.phase === 'mono' && x.section === section);
          need[k] = liste6ou10.length;
          for (const x of liste6ou10) versTd.push({ cle: k, fonctions: [`Départ ${x.nom}`], kw: chargeTotale(x) * KW.diversiteTd, typeA: false, sousId: false });
        }
      }
      // protections 4P : un disjoncteur différentiel par appareil 400 V, et, au TGBT tétra, un départ par TD tétra
      const quatre: { cle: string; fonctions: string[]; kw: number }[] = t.fn.tri.map((x) => ({ cle: x.cle, fonctions: [x.libelle], kw: x.kw }));
      if (t.id === 'TGBT' && tdTetra.length) {
        if (tetra) for (const x of tdTetra) quatre.push({ cle: 'DD4_C32_AC300', fonctions: [`Départ ${x.nom}`], kw: chargeTotale(x) * KW.diversiteTd });
        else att(`Départ des TD tétra (${tdTetra.map((x) => x.nom).join(', ')}) à prévoir à la main dans le TGBT.`);
      }
      for (const q of quatre) need[q.cle] = (need[q.cle] ?? 0) + 1;

      if (!tetra) {
        const idA = Math.max(base('IDA'), ceil(t.nA, 8));
        need.IDA = idA;
        // les ID type A peuvent aussi protéger des circuits AC : on ne rajoute de l'AC que pour le reste
        need.IDAC = Math.max(base('IDAC'), ceil(Math.max(0, nbCircuits - idA * 8), 8));
      } else {
        // tétra : chaque départ 1P+N va sur la phase la moins chargée (les plus gros d'abord), puis
        // chaque interrupteur différentiel 2P protège au plus 8 circuits d'une même phase (type A s'il y en a un qui l'exige)
        const charges = repartir([...liste, ...versTd], quatre.reduce((a, x) => a + x.kw, 0));
        phases = { L1: Math.round(charges.L1 * 10) / 10, L2: Math.round(charges.L2 * 10) / 10, L3: Math.round(charges.L3 * 10) / 10 };
        const idA: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 };
        const reste: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 };
        for (const p of PHASES) {
          const sur = liste.filter((x) => x.phase === p);
          idA[p] = ceil(sur.filter((x) => x.typeA).length, 8);
          reste[p] = Math.max(0, sur.length - idA[p] * 8);
        }
        // les ID type A déjà facturés dans l'ensemble servent aussi aux circuits AC : on les place là où il en manque
        let libres = Math.max(0, base('IDA') - PHASES.reduce((a, p) => a + idA[p], 0));
        while (libres > 0) {
          const p = PHASES.reduce((m, x) => (reste[x] > reste[m] ? x : m), 'L1' as Phase);
          if (!reste[p]) break;
          idA[p]++; reste[p] = Math.max(0, reste[p] - 8); libres--;
        }
        const idAC: Record<Phase, number> = { L1: ceil(reste.L1, 8), L2: ceil(reste.L2, 8), L3: ceil(reste.L3, 8) };
        need.IDA = PHASES.reduce((a, p) => a + idA[p], 0);
        need.IDAC = PHASES.reduce((a, p) => a + idAC[p], 0);
        departs.IDA = PHASES.flatMap((p) => Array.from({ length: idA[p] }, () => [`Différentiel ${p}`]));
        departs.IDAC = PHASES.flatMap((p) => Array.from({ length: idAC[p] }, () => [`Différentiel ${p}`]));
        for (const k of ['DD4_C16_AC30', 'DD4_C32_AC30']) {
          if (need[k]) att(`${t.nom} : ${need[k]} × ${PROTECTIONS[k].label.replace(' (référence à choisir)', '')}, référence Legrand à choisir dans Esabora.`, t.pieceId);
        }
      }
      nbCircuits += quatre.length;

      // étiquettes : en tétra, la phase devant la fonction (« L2 · Éclairage Salon »)
      const etiquette = (x: Depart) => (x.phase ? [`${x.phase} · ${x.fonctions[0]}`, ...x.fonctions.slice(1)] : x.fonctions);
      for (const k of ['C10', 'C16', 'C20', 'C32']) departs[k] = liste.filter((x) => x.cle === k).map(etiquette);
      for (const x of versTd) (departs[x.cle] ??= []).push(etiquette(x));
      for (const q of quatre) (departs[q.cle] ??= []).push(q.fonctions);

      for (const k of ORDRE_PROTECTIONS) {
        const n = need[k] ?? 0; const bq = base(k);
        if (!n && !bq) continue;
        protections.push({
          cle: k, label: PROTECTIONS[k].label, ref: t.modele.base[k]?.ref ?? PROTECTIONS[k].ref,
          besoin: n, base: bq, final: Math.max(n, bq),
        });
      }
      const ch = protections.filter((x) => x.final !== x.base);
      if (ch.length) aModifier.push({ bloc: t.bloc, tableau: t.nom, ensemble: t.modele.code, changements: ch });

      // le contenu final doit tenir sur les rails du coffret de l'ensemble
      const places = placesCoffret(t.modele);
      const occupes = (t.modele.fixes ?? []).reduce((a, f) => a + f.modules, 0)
        + protections.reduce((a, x) => a + x.final * (MODULES_PROTECTION[x.cle] ?? 1), 0);
      if (places && occupes > places) {
        att(`${t.nom} : ${occupes} modules pour ${places} places dans le coffret (${t.modele.coffret!.nom}). Prévoir un coffret plus grand dans Esabora.`, t.pieceId);
      }
    } else {
      att(`${t.nom} est en tétra : le calcul des disjoncteurs n’est pas géré, à faire dans Esabora.`, t.pieceId);
      // on montre quand même le contenu de l'ensemble tel qu'il est facturé (rien n'est recalculé)
      for (const k of ORDRE_PROTECTIONS) {
        const bq = base(k);
        if (bq) protections.push({ cle: k, label: PROTECTIONS[k].label, ref: t.modele.base[k]?.ref ?? PROTECTIONS[k].ref, besoin: bq, base: bq, final: bq });
      }
    }
    resTableaux.push({
      id: t.id, nom: t.nom, bloc: t.bloc, ensemble: t.modele.code, modele: t.modeleCle, pieceId: t.pieceId, calculable: t.modele.calculable,
      points: t.points, socles: t.socles, appareilsVr: t.vr, circuitsA: t.nA, circuits: nbCircuits,
      protections, rattachees: t.rattachees, detail: t.detail, canaux: t.canaux, modules: modulesParTableau.get(t.id) ?? {},
      departs, phases,
    });
  }


  // ordre d'affichage : celui des pièces dans le devis
  const rang = (pieceId: string) => pieces.findIndex((p) => p.id === pieceId);
  resTableaux.sort((a, b) => rang(a.pieceId) - rang(b.pieceId));
  aModifier.sort((a, b) => pieces.findIndex((p) => p.nom.trim() === a.bloc) - pieces.findIndex((p) => p.nom.trim() === b.bloc));

  // ---------- bloc Domotique
  const tx = params.tauxMo;
  if (domotique) {
    for (const k of ORDRE_DOMOTIQUE) {
      const n = domotique.modules[k];
      if (!n) continue;
      const d = params.domotique[k];
      lignes.push({ bloc: 'Domotique', ref: null, designation: d.designation, quantite: n, pu: d.pu, coefMat: d.coefMat, coefMo: d.coefMo, moUnit: d.heures, tauxMo: tx, unite: 'U' });
    }
    if (data.domotique.coupure > 0) {
      const d = params.domotique.COUPURE;
      lignes.push({ bloc: 'Domotique', ref: null, designation: d.designation, quantite: data.domotique.coupure, pu: d.pu, coefMat: d.coefMat, coefMo: d.coefMo, moUnit: d.heures, tauxMo: tx, unite: 'U' });
    }
    const e = params.domotique.ETS;
    lignes.push({ bloc: 'Domotique', ref: null, designation: e.designation, quantite: 1, pu: e.pu, coefMat: e.coefMat, coefMo: e.coefMo, moUnit: data.domotique.heuresEts ?? 0, tauxMo: tx, unite: 'U' });
    // les prix ne sont pas dans le code : signaler ceux qui n'ont pas encore été saisis
    const sansPrix = ORDRE_DOMOTIQUE.filter((k) => domotique!.modules[k] && !(params.domotique[k]?.pu > 0));
    if (sansPrix.length) {
      att(`Domotique : prix à 0 € pour ${sansPrix.map((k) => `« ${params.domotique[k].designation} »`).join(', ')}. À renseigner dans Utilisateurs et prix.`);
    }
  }
  if (!(tx > 0) && (domotique || data.divers.some((d) => d.quantite > 0))) {
    att('Taux de main d’œuvre à 0 € : à régler dans Utilisateurs et prix.');
  }

  // ---------- bloc Divers
  for (const d of data.divers) {
    if (!(d.quantite > 0)) continue;
    if (!d.designation.trim()) { err('Divers : une ligne n’a pas de désignation.'); continue; }
    if (d.pu == null || d.heures == null) err(`Divers : « ${d.designation.trim()} » : renseigne le prix et les heures (0 si aucun).`);
    lignes.push({
      bloc: 'Divers', ref: null, designation: d.designation.trim(), quantite: d.quantite, pu: d.pu ?? 0,
      coefMat: d.coefMat ?? 1, coefMo: params.coefMo, moUnit: d.heures ?? 0, tauxMo: tx, unite: 'U',
    });
  }

  if (!pieces.length) err('Ajoute au moins une pièce.');
  for (const p of pieces) if (!TYPES_PIECES[p.type]) att(`${p.nom} : type de pièce inconnu.`, p.id);

  return { lignes, tableaux: resTableaux, aModifier, domotique, alertes };
}
