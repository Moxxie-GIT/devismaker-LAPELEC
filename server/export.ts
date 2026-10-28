// Construction du fichier d'import Esabora à partir du résultat du moteur.
import type { Devis, Resultat } from '../shared/types';
import { S, ecrireXlsx, type Cellule, type Feuille } from './xlsx';

const COLONNES = ['N°', 'Référence', 'Désignation', 'Quantité', 'Prix unitaire', 'Coef Mat.', 'Coef M.O.', 'M.O. Unit.', 'Taux M.O.', 'Unité'];

const c = (v: Cellule['v'], s: number = S.NORMAL): Cellule => ({ v, s });

export function feuilles(devis: Devis, r: Resultat): Feuille[] {
  // 1. IMPORT : la seule feuille à importer
  const imp: Cellule[][] = [COLONNES.map((h, i) => c(h, i < 2 ? S.ENTETE_TEXTE : S.ENTETE))];
  for (const l of r.lignes) {
    imp.push([
      c(l.bloc, S.TEXTE), c(l.ref, S.TEXTE), c(l.designation), c(l.quantite), c(l.pu), c(l.coefMat), c(l.coefMo),
      c(l.moUnit), c(l.tauxMo), c(l.unite),
    ]);
  }

  // 2. TABLEAUX À MODIFIER
  const mod: Cellule[][] = [
    [c("Après l'import : quantités à changer dans les ensembles tableaux (ne pas importer cette feuille)", S.TITRE)],
    [c("Seules les lignes qui changent sont listées. Tout le reste de l'ensemble reste tel quel (minimum facturé).", S.ITALIQUE)],
  ];
  if (!r.aModifier.length) mod.push([], [c('Aucun changement : les ensembles minimum suffisent.')]);
  for (const m of r.aModifier) {
    mod.push([], [c(`Bloc « ${m.bloc} »  >  ensemble ${m.ensemble}`, S.SOUS_TITRE)]);
    mod.push(['Article', 'Référence', 'Quantité actuelle', 'Quantité à mettre'].map((h) => c(h, S.TH)));
    for (const ch of m.changements) {
      mod.push([c(ch.label), c(ch.ref), c(ch.base ? ch.base : "0 (à ajouter dans l'ensemble)"), c(ch.final, S.SURLIGNE)]);
    }
  }
  const tetra = r.tableaux.filter((t) => !t.calculable);
  if (tetra.length) {
    mod.push([], [c('Tableaux tétra : calcul non géré, à faire dans Esabora', S.SOUS_TITRE)]);
    for (const t of tetra) mod.push([c(`Bloc « ${t.bloc} »  >  ensemble ${t.ensemble}`)]);
  }

  // 3. DÉTAIL CALCUL
  const det: Cellule[][] = [
    [c('Contrôle des calculs : feuille à ne PAS importer (importer uniquement la feuille IMPORT)', S.TITRE)],
    [c(`${devis.titre}${devis.client ? ` (${devis.client})` : ''}`, S.ITALIQUE)],
  ];
  const attentions = r.alertes.filter((a) => a.niveau === 'attention');
  if (attentions.length) {
    det.push([], [c('Points à vérifier', S.SOUS_TITRE)]);
    for (const a of attentions) det.push([c(`• ${a.message}`)]);
  }
  for (const t of r.tableaux) {
    det.push([], [c(`${t.nom}  (${t.ensemble}, bloc « ${t.bloc} »)`, S.SOUS_TITRE)]);
    if (!t.calculable) { det.push([c('Tableau tétra : calcul des disjoncteurs non géré.')]); continue; }
    det.push([c(`Points lumineux : ${t.points}  |  Socles de prises : ${t.socles}  |  Volets/stores/rideaux/ventilos/portail : ${t.appareilsVr}  |  Circuits type A : ${t.circuitsA}  |  Circuits au total : ${t.circuits}`)]);
    det.push(['Protection', 'Besoin', "Minimum de l'ensemble", 'Quantité finale', 'Référence'].map((h) => c(h, S.TH)));
    for (const p of t.protections) det.push([c(p.label), c(p.besoin), c(p.base), c(p.final), c(p.ref)]);
    det.push([c('Rattaché à ce tableau :')]);
    for (const d of t.detail) det.push([c(`   ${d}`)]);
  }
  if (r.domotique) {
    det.push([], [c('Domotique : canaux et modules par tableau', S.SOUS_TITRE)]);
    det.push(['Tableau', 'Canaux on/off', 'Var. 1-10V', 'Var. 230V', 'DALI', 'Stores/rideaux/volets', 'Modules'].map((h) => c(h, S.TH)));
    for (const t of r.tableaux) {
      const k = t.canaux;
      det.push([c(t.nom), c(k.onoff ?? 0), c(k.SM4 ?? 0), c(k.DM4T ?? 0), c(k.DALI ?? 0), c(k.JM4T ?? 0),
        c(Object.entries(t.modules).filter(([, n]) => n).map(([m, n]) => `${n} × ${m}`).join(', '))]);
    }
    det.push([], [c("Domotique : modules d'entrée par inter", S.SOUS_TITRE)]);
    det.push(['Pièce', 'Inter', 'Boutons', 'Modules'].map((h) => c(h, S.TH)));
    for (const i of r.domotique.parInter) det.push([c(i.piece), c(`Inter ${i.inter}`), c(i.boutons), c(i.modules)]);
  }

  return [
    { nom: 'IMPORT', largeurs: [16, 13, 70, 9, 12, 9, 9, 10, 9, 7], lignes: imp, figerEntete: true },
    { nom: 'TABLEAUX À MODIFIER', largeurs: [62, 13, 30, 17], lignes: mod },
    { nom: 'DÉTAIL CALCUL', largeurs: [52, 14, 20, 16, 22, 22, 40], lignes: det },
  ];
}

export async function fichierImport(devis: Devis, r: Resultat): Promise<Buffer> {
  return ecrireXlsx(feuilles(devis, r));
}

export function nomFichier(devis: Devis): string {
  const base = `Import Esabora - ${devis.titre || 'devis'}`.replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `${base}.xlsx`;
}
