// Registre des lots. Pour ajouter un lot (CFA, ENR...), créer un dossier sur le modèle de cfo/
// et l'enregistrer ici : catalogue, types de pièces et moteur propres au lot.
import type { DevisData, Parametres, Piece, Resultat } from '../types';
import { calculer as calculerCfo } from './cfo/moteur';
import { DIVERS_MODELES, DOMOTIQUE_DEFAUT } from './cfo/catalogue';
import { uid } from './cfo/pieces';

export interface Lot {
  cle: string;
  label: string;
  calculer: (data: DevisData, params: Parametres) => Resultat;
}

export const LOTS: Record<string, Lot> = {
  cfo: { cle: 'cfo', label: 'CFO', calculer: calculerCfo },
};

export function parametresParDefaut(): Parametres {
  return {
    tauxMo: 0,   // à régler dans Utilisateurs et prix
    coefMo: 1,
    domotique: structuredClone(DOMOTIQUE_DEFAUT),
    diversModeles: [...DIVERS_MODELES],
  };
}

/** Complète des paramètres enregistrés avec les valeurs par défaut (nouvelles clés après une mise à jour). */
export function fusionnerParametres(p: Partial<Parametres> | null | undefined): Parametres {
  const d = parametresParDefaut();
  if (!p) return d;
  return {
    tauxMo: typeof p.tauxMo === 'number' ? p.tauxMo : d.tauxMo,
    coefMo: typeof p.coefMo === 'number' ? p.coefMo : d.coefMo,
    domotique: { ...d.domotique, ...(p.domotique ?? {}) },
    diversModeles: Array.isArray(p.diversModeles) ? p.diversModeles : d.diversModeles,
  };
}

const nombre = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const texte = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

/**
 * Complète un devis enregistré par une version précédente de l'outil (champs ajoutés depuis).
 * Appelé à chaque lecture : les anciens devis restent ouvrables après une mise à jour.
 */
export function normaliserDevisData(brut: any): DevisData {
  const d = brut && typeof brut === 'object' ? brut : {};
  const piece = (p: any): Piece => ({
    id: texte(p?.id, uid()), nom: texte(p?.nom), type: texte(p?.type, 'libre'),
    tableau: {
      choix: ['TD', 'TGBT', 'AUCUN'].includes(p?.tableau?.choix) ? p.tableau.choix : null,
      phase: p?.tableau?.phase === 'tetra' ? 'tetra' : 'mono',
      section: p?.tableau?.section === 10 ? 10 : 6,
      modele: p?.tableau?.modele === 'plomberie' ? 'plomberie' : 'standard',
      alimentePar: texte(p?.tableau?.alimentePar, 'TGBT'),
    },
    circuits: Array.isArray(p?.circuits) ? p.circuits.map((c: any) => ({
      id: texte(c?.id, uid()), type: texte(c?.type, 'autre'), nom: texte(c?.nom), lieu: c?.lieu === 'ext' ? 'ext' : 'int',
      nb: nombre(c?.nb), commande: ['onoff', 'v110', 'v230', 'dali'].includes(c?.commande) ? c.commande : 'onoff',
      pose: ['std', 'led_facile', 'led_difficile', 'aucune'].includes(c?.pose) ? c.pose : 'std',
    })) : [],
    inters: Array.isArray(p?.inters) ? p.inters.filter((n: unknown) => typeof n === 'number' && n >= 1) : [],
    detecteurs: nombre(p?.detecteurs),
    classique: { sa: nombre(p?.classique?.sa), vv: nombre(p?.classique?.vv), bps: nombre(p?.classique?.bps) },
    elements: Array.isArray(p?.elements) ? p.elements.map((e: any) => ({
      id: texte(e?.id, uid()), cle: texte(e?.cle), designation: texte(e?.designation), quantite: nombre(e?.quantite),
    })) : [],
  });
  return {
    mode: d.mode === 'CLASSIQUE' ? 'CLASSIQUE' : 'KNX',
    pieces: Array.isArray(d.pieces) ? d.pieces.map(piece) : [],
    domotique: {
      actif: d.domotique?.actif !== false,
      heuresEts: typeof d.domotique?.heuresEts === 'number' ? d.domotique.heuresEts : null,
      coupure: nombre(d.domotique?.coupure, 1),
    },
    divers: Array.isArray(d.divers) ? d.divers.map((l: any) => ({
      id: texte(l?.id, uid()), designation: texte(l?.designation), quantite: nombre(l?.quantite, 1),
      pu: typeof l?.pu === 'number' ? l.pu : null, coefMat: typeof l?.coefMat === 'number' ? l.coefMat : 1,
      heures: typeof l?.heures === 'number' ? l.heures : null,
    })) : [],
    notes: texte(d.notes),
  };
}

export function nouveauDevisData(params: Parametres): DevisData {
  return {
    mode: 'KNX',
    pieces: [],
    domotique: { actif: true, heuresEts: null, coupure: 1 },
    divers: params.diversModeles.map((designation) => ({ id: uid(), designation, quantite: 1, pu: null, coefMat: 1, heures: null })),
    notes: '',
  };
}
