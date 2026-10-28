// Types de pièces du lot CFO : questions posées et valeurs pré-remplies.
import type { Circuit, Element, Piece, Tableau } from '../../types';
import { CATALOGUE, LUMINAIRES } from './catalogue';

// crypto.randomUUID n'existe pas en HTTP simple (hors localhost) : générateur maison.
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export interface TypePiece {
  label: string;
  suffixe: string;                       // ajouté au nom des luminaires (« spot chambre »)
  conseilTableau: 'TD' | 'TGBT' | 'AUCUN';
  aide: string;                          // texte d'aide sous la question du tableau
  section?: 6 | 10;
  modele?: 'standard' | 'plomberie';
  circuits: [string, number, Partial<Circuit>?][];
  elements: [string, number][];          // [clé catalogue, quantité par défaut] (0 = proposé)
}

export const TYPES_PIECES: Record<string, TypePiece> = {
  chambre: {
    label: 'Chambre', suffixe: 'chambre', conseilTableau: 'TD',
    aide: 'Les chambres ont souvent leur propre TD, mais pas toujours : à vérifier sur le plan.',
    circuits: [['spot', 6], ['led', 1], ['liseuse', 2]],
    elements: [['PCS', 1], ['PCD', 4], ['USB', 2], ['PCQ', 0], ['PCDI_FRIGO', 0], ['PCDI_CAFE', 0], ['PCDI_BOUILLOIRE', 0],
      ['VENTILO', 0], ['RIDEAUX', 0], ['CLIM', 1], ['VMC', 1], ['PCSE', 0], ['PCSEP', 0], ['ELE', 0]],
  },
  sdb: {
    label: 'Salle de bain / WC', suffixe: 'salle de bain', conseilTableau: 'AUCUN',
    aide: 'Une SDB ou un WC indépendant est en général alimenté par le TD voisin ou le TGBT.',
    circuits: [['spot', 4], ['miroir', 1]],
    elements: [['PCS', 1], ['PCSE', 0], ['VMC', 1], ['ELE', 1], ['LL', 0]],
  },
  cuisine: {
    label: 'Cuisine / office', suffixe: 'cuisine', conseilTableau: 'TD', section: 10,
    aide: 'Avec la plaque, le TD de cuisine est en général alimenté en 10 mm².',
    circuits: [['spot', 5], ['led', 1, { nom: 'LED meuble cuisine' }], ['suspente', 0, { nom: 'Suspente îlot' }]],
    elements: [['PCDI_FOUR', 1], ['PCDI_MO', 1], ['PCDI_LV', 1], ['PCDI_FRIGO', 1], ['PCDI_HOTTE', 1], ['PLAQUE', 1],
      ['PCD_CUISINE', 3], ['PCS', 1], ['PCDI_CONGEL', 0], ['PCDI_CAVE', 0], ['PCDI_GLACONS', 0], ['PSOL', 0], ['CLIM', 1], ['VMC', 1]],
  },
  salon: {
    label: 'Salon / séjour', suffixe: 'salon', conseilTableau: 'AUCUN',
    aide: 'Le salon est souvent sur le TGBT, parfois sur son propre TD.',
    circuits: [['charpente', 6], ['suspente', 2], ['led', 0]],
    elements: [['PCD_TV', 1], ['PCS', 3], ['PCS_CMD', 0], ['PSOL', 0], ['PCQ', 0], ['VOLET', 0], ['VENTILO', 0], ['CLIM', 1]],
  },
  buanderie: {
    label: 'Buanderie / laverie', suffixe: 'buanderie', conseilTableau: 'AUCUN',
    aide: 'Une grosse buanderie (plusieurs machines) peut justifier son propre TD.',
    circuits: [['spot', 2]],
    elements: [['LL', 1], ['SL', 1], ['PCD', 1], ['PCS', 1], ['CE', 0], ['CLIM', 0], ['VMC', 1]],
  },
  terrasse: {
    label: 'Terrasse / deck / ajoupa', suffixe: 'terrasse', conseilTableau: 'AUCUN',
    aide: "Un ajoupa avec cuisine extérieure peut avoir son propre TD (Plexo étanche).",
    circuits: [['charpente', 4, { lieu: 'ext' }], ['applique', 2, { lieu: 'ext' }]],
    elements: [['PCSEP', 2], ['PDEP', 0], ['STORE', 0], ['VENTILO', 0], ['PCDI_FRIGO', 0], ['PSOL', 0]],
  },
  exterieur: {
    label: 'Extérieur / jardin', suffixe: '', conseilTableau: 'AUCUN',
    aide: "L'éclairage extérieur part en général du TGBT.",
    circuits: [['piquet', 10], ['balisage', 4], ['spot_sol', 0], ['marche', 0], ['applique', 0, { lieu: 'ext', nom: 'Applique murale' }]],
    elements: [['PCSEP', 2], ['PORTAIL', 0]],
  },
  parking: {
    label: 'Parking / garage', suffixe: 'parking', conseilTableau: 'AUCUN', aide: '',
    circuits: [['applique', 4, { lieu: 'ext' }], ['spot', 0, { lieu: 'ext' }]],
    elements: [['PCSEP', 1]],
  },
  petite: {
    label: 'Couloir / rangement / local', suffixe: '', conseilTableau: 'AUCUN', aide: '',
    circuits: [['spot', 2]],
    elements: [['PCS', 1], ['CLIM', 0], ['VMC', 0]],
  },
  spa: {
    label: 'Spa / fitness', suffixe: 'spa', conseilTableau: 'AUCUN',
    aide: 'Un spa avec sauna et jacuzzi a souvent son propre TD.',
    circuits: [['spot', 4], ['led', 1]],
    elements: [['JACUZZI', 0], ['SAUNA', 0], ['BASSIN', 0], ['CE', 0], ['PCDI_MACHINE', 0], ['PCS', 2], ['PCD_TV', 0], ['CLIM', 1], ['VMC', 1]],
  },
  local_tech: {
    label: 'Local technique électrique', suffixe: 'local technique', conseilTableau: 'TGBT',
    aide: 'Le TGBT est en général dans le local technique.',
    circuits: [['neon', 1, { nom: 'Néon' }]],
    elements: [['PCS_SERVICE', 1], ['ENRMONO', 0], ['BAIE', 1], ['ASSAIN', 0], ['DRV220', 0],
      ['MONTECHARGE', 0], ['CLIM', 0]],
  },
  plomberie: {
    label: 'Local plomberie / piscine', suffixe: 'local plomberie', conseilTableau: 'TD', modele: 'plomberie',
    aide: 'Le local plomberie a souvent son propre tableau (ENSETDPLOMB), sinon il part du TGBT.',
    circuits: [['neon', 1, { nom: 'Néon' }], ['transfo', 0]],
    elements: [['PCS_SERVICE', 1], ['PPIS', 1], ['FPIS', 1], ['ELCY', 1], ['CIT', 1], ['PEV', 0], ['RELEVAGE', 0], ['CEAU', 0],
      ['CE', 1], ['PAC', 0], ['FLOTTEUR', 0], ['TP', 1]],
  },
  libre: {
    label: 'Pièce libre', suffixe: '', conseilTableau: 'AUCUN', aide: '',
    circuits: [], elements: [],
  },
};

export const ORDRE_TYPES = ['chambre', 'sdb', 'cuisine', 'salon', 'buanderie', 'terrasse', 'exterieur', 'parking', 'petite', 'spa',
  'local_tech', 'plomberie', 'libre'];

export function nomCircuitParDefaut(typeLum: string, typePiece: string): string {
  const l = LUMINAIRES[typeLum]?.label ?? 'Point lumineux';
  const s = TYPES_PIECES[typePiece]?.suffixe;
  return s ? `${l} ${s}` : l;
}

export function nouveauCircuit(typeLum: string, typePiece: string, nb = 1, extra: Partial<Circuit> = {}): Circuit {
  const l = LUMINAIRES[typeLum] ?? LUMINAIRES.autre;
  return {
    id: uid(), type: typeLum, nom: nomCircuitParDefaut(typeLum, typePiece), lieu: l.lieu, nb,
    commande: 'onoff', pose: l.pose, ...extra,
  };
}

export function nouvelElement(cle: string, quantite = 1): Element {
  const c = CATALOGUE[cle];
  return { id: uid(), cle, designation: c ? c.designation : cle, quantite };
}

export function tableauParDefaut(type: string): Tableau {
  const t = TYPES_PIECES[type];
  return { choix: null, phase: 'mono', section: t?.section ?? 6, modele: t?.modele ?? 'standard', alimentePar: 'TGBT', alimTgbt: 'edf' };
}

export function nouvellePiece(type: string, nom: string): Piece {
  const t = TYPES_PIECES[type] ?? TYPES_PIECES.libre;
  return {
    id: uid(), nom, type,
    tableau: tableauParDefaut(type),
    circuits: t.circuits.map(([lum, nb, extra]) => nouveauCircuit(lum, type, nb, extra ?? {})),
    inters: [], detecteurs: 0,
    classique: { sa: 0, vv: 0, bps: 0 },
    elements: t.elements.map(([cle, q]) => nouvelElement(cle, q)),
  };
}

/** Copie d'une pièce avec de nouveaux identifiants. */
export function dupliquerPiece(p: Piece, nom: string): Piece {
  return {
    ...structuredClone(p), id: uid(), nom,
    circuits: p.circuits.map((c) => ({ ...c, id: uid() })),
    elements: p.elements.map((e) => ({ ...e, id: uid() })),
    tableau: { ...p.tableau },
    inters: [...p.inters],
    classique: { ...p.classique },
  };
}
