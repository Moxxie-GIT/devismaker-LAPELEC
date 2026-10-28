// Moteur de calcul du lot CFO : devis saisi -> lignes d'import Esabora + calculs tableaux / domotique.
import type {
  Alerte, DevisData, LigneImport, Parametres, Piece, Protection, Resultat, TableauCalcule,
} from '../../types';
import {
  ALIM_TD, CATALOGUE, HEURES_POSE, ORDRE_DOMOTIQUE, ORDRE_PROTECTIONS, PROTECTIONS, TABLEAUX, type ModeleTableau,
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

interface TableauInterne {
  id: string; nom: string; bloc: string; pieceId: string; modele: ModeleTableau; modeleCle: string; section: 6 | 10; phase: 'mono' | 'tetra';
  points: number; socles: number; vr: number; nA: number; ded: Record<string, number>;
  rattachees: string[]; detail: string[]; canaux: Record<string, number>;
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
      if (t) { t.points += c.nb; t.detail.push(`${b} : ${c.nb} point(s) ${nom}`); }
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
        case 'P': t.socles += (c.socles ?? 1) * e.quantite; break;
        case 'VR': t.vr += e.quantite; break;
        case 'TRI':
          if (t.modele.calculable) att(`${b} : « ${des} » est en 400 V alors que ${t.nom} est monophasé.`, p.id);
          break;
        case null: break;
        default:
          t.ded[c.protection] = (t.ded[c.protection] ?? 0) + e.quantite;
          if (c.typeA) t.nA += e.quantite;
      }
      if (c.protection) t.detail.push(`${b} : ${e.quantite} × ${des}`);
    }

    // tableau de la pièce
    if (p.tableau.choix === 'TD') {
      const tab = tableaux.get(p.id)!;
      const alim = ALIM_TD[`${p.tableau.phase}-${p.tableau.section}`];
      L(alim.code, alim.designation, 1);
      L(tab.modele.code, tab.modele.designation, 1);
      if (knx) L('ENSELB', 'Liaison bus TD vers TGBT', 1);
    } else if (p.tableau.choix === 'TGBT') {
      const tab = tableaux.get('TGBT');
      if (tab && tab.pieceId === p.id) L(tab.modele.code, tab.modele.designation, 1);
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
    if (tg) { tg.ded.C10 = (tg.ded.C10 ?? 0) + total.ALIM; tg.detail.push(`Alimentation KNX 640 mA : ${total.ALIM}`); }
    domotique = { modules: total, participants, parInter };
    if (data.domotique.heuresEts == null) err('Domotique : indique le nombre d’heures de programmation ETS.');
  }

  // ---------- protections par tableau
  const resTableaux: TableauCalcule[] = [];
  const aModifier: Resultat['aModifier'] = [];
  const tds = [...tableaux.values()].filter((t) => t.id !== 'TGBT');
  for (const t of tableaux.values()) {
    const protections: Protection[] = [];
    let nbCircuits = 0;
    if (t.modele.calculable) {
      const need: Record<string, number> = {
        C10: ceil(t.points, 8) + ceil(t.vr, 8) + (t.ded.C10 ?? 0),
        C16: t.ded.C16 ?? 0,
        C20: ceil(t.socles, 12) + (t.ded.C20 ?? 0),
        C32: t.ded.C32 ?? 0,
      };
      nbCircuits = need.C10 + need.C16 + need.C20 + need.C32;
      const base = (k: string) => t.modele.base[k]?.q ?? 0;
      const idA = Math.max(base('IDA'), ceil(t.nA, 8));
      need.IDA = idA;
      // les ID type A peuvent aussi protéger des circuits AC : on ne rajoute de l'AC que pour le reste
      need.IDAC = Math.max(base('IDAC'), ceil(Math.max(0, nbCircuits - idA * 8), 8));
      if (t.id === 'TGBT') {
        need.D32 = tds.filter((x) => x.phase === 'mono' && x.section === 6).length;
        need.D40 = tds.filter((x) => x.phase === 'mono' && x.section === 10).length;
        const tetra = tds.filter((x) => x.phase === 'tetra');
        if (tetra.length) att(`Départ des TD tétra (${tetra.map((x) => x.nom).join(', ')}) à prévoir à la main dans le TGBT.`);
      }
      for (const k of ORDRE_PROTECTIONS) {
        const n = need[k] ?? 0; const bq = base(k);
        if (!n && !bq) continue;
        const pr: Protection = {
          cle: k, label: PROTECTIONS[k].label, ref: t.modele.base[k]?.ref ?? PROTECTIONS[k].ref,
          besoin: n, base: bq, final: Math.max(n, bq),
        };
        protections.push(pr);
      }
      const ch = protections.filter((x) => x.final !== x.base);
      if (ch.length) aModifier.push({ bloc: t.bloc, tableau: t.nom, ensemble: t.modele.code, changements: ch });
    } else {
      att(`${t.nom} est en tétra : le calcul des disjoncteurs n’est pas géré, à faire dans Esabora.`, t.pieceId);
    }
    resTableaux.push({
      id: t.id, nom: t.nom, bloc: t.bloc, ensemble: t.modele.code, modele: t.modeleCle, pieceId: t.pieceId, calculable: t.modele.calculable,
      points: t.points, socles: t.socles, appareilsVr: t.vr, circuitsA: t.nA, circuits: nbCircuits,
      protections, rattachees: t.rattachees, detail: t.detail, canaux: t.canaux, modules: modulesParTableau.get(t.id) ?? {},
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
