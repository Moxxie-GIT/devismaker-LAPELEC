// Totaux par bloc des lignes exportées (même calcul que l'écran Domotique et qu'Esabora à l'import).
// Seules les lignes chiffrées par l'outil (Domotique, Divers) ont un montant : les blocs des pièces sont faits
// d'ensembles Esabora, dont les prix ne sont connus que d'Esabora.
import type { LigneImport } from './types';

export interface TotalBloc {
  bloc: string;
  lignes: number;
  articles: number;           // somme des quantités
  heures: number;             // heures de main d'œuvre portées par les lignes (M.O. unit. × quantité)
  materiel: number | null;    // € HT, null si le bloc n'est pas chiffré par l'outil
  mainOeuvre: number | null;
  total: number | null;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

export function totauxParBloc(lignes: LigneImport[]): { blocs: TotalBloc[]; general: TotalBloc } {
  const parBloc = new Map<string, TotalBloc>();
  for (const l of lignes) {
    let t = parBloc.get(l.bloc);
    if (!t) { t = { bloc: l.bloc, lignes: 0, articles: 0, heures: 0, materiel: null, mainOeuvre: null, total: null }; parBloc.set(l.bloc, t); }
    const q = l.quantite || 0;
    t.lignes++; t.articles += q;
    if (l.moUnit != null) t.heures += l.moUnit * q;
    if (l.pu != null) t.materiel = arrondi((t.materiel ?? 0) + q * arrondi(l.pu * (l.coefMat ?? 1)));
    if (l.moUnit != null && l.tauxMo != null) t.mainOeuvre = arrondi((t.mainOeuvre ?? 0) + q * arrondi(l.moUnit * l.tauxMo * (l.coefMo ?? 1)));
  }
  const blocs = [...parBloc.values()].map((t) => ({
    ...t, heures: arrondi(t.heures),
    total: t.materiel == null && t.mainOeuvre == null ? null : arrondi((t.materiel ?? 0) + (t.mainOeuvre ?? 0)),
  }));
  const somme = (f: (t: TotalBloc) => number | null) => arrondi(blocs.reduce((a, t) => a + (f(t) ?? 0), 0));
  const chiffres = blocs.some((t) => t.total != null);
  return {
    blocs,
    general: {
      bloc: 'Total', lignes: somme((t) => t.lignes), articles: somme((t) => t.articles), heures: somme((t) => t.heures),
      materiel: chiffres ? somme((t) => t.materiel) : null, mainOeuvre: chiffres ? somme((t) => t.mainOeuvre) : null,
      total: chiffres ? somme((t) => t.total) : null,
    },
  };
}
