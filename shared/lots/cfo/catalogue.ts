// Catalogue du lot CFO : ensembles Esabora et règles de protection associées.
// Les codes (ENSE..., Leg ...) sont ceux de la bibliothèque Esabora de LAPELEC.

export const NOTE_ML =
  ' Veuillez noter que le prix est susceptible de varier en fonction du nombre de mètres linéaire réellement réalisé dans le cadre des travaux.';

/**
 * Protection d'un équipement dans son tableau :
 *  'P'   prises de service : C20, 12 socles max par disjoncteur
 *  'VR'  volets, stores, rideaux, ventilateurs, portail : C10, 8 appareils max
 *  'C10' | 'C16' | 'C20' | 'C32' : circuit dédié
 *  'TRI' appareil 400 V (à vérifier dans un tableau tétra)
 *  null  pas de disjoncteur
 */
export type Protection = 'P' | 'VR' | 'C10' | 'C16' | 'C20' | 'C32' | 'TRI' | null;

export interface ItemCatalogue {
  code: string;               // référence Esabora importée
  designation: string;        // désignation par défaut (modifiable dans la pièce)
  groupe: string;             // regroupement dans l'interface
  protection: Protection;
  socles?: number;            // pour les prises de service
  typeA?: boolean;            // protégé par un ID type A (plaque, lave-linge)
  canal?: 'onoff' | 'jm';     // canal domotique consommé (KNX)
  poseMo1?: number;           // ajoute une ligne de pose MO1 (heures)
  poseDes?: string;
}

const PCDI = (q: string): ItemCatalogue => ({
  code: 'ENSEPCDI', designation: `Prise 2P+T 220V directe (${q})`, groupe: 'Prises dédiées', protection: 'C20',
});

export const CATALOGUE: Record<string, ItemCatalogue> = {
  // --- prises de service
  PCS: { code: 'ENSEPCS', designation: 'Prise simple 2P+T 220V', groupe: 'Prises', protection: 'P', socles: 1 },
  PCS_SERVICE: { code: 'ENSEPCS', designation: 'Prise simple 2P+T 220V (service)', groupe: 'Prises', protection: 'P', socles: 1 },
  PCS_CMD: { code: 'ENSEPCS', designation: 'Prise simple 2P+T 220V (commandée)', groupe: 'Prises', protection: 'P', socles: 1, canal: 'onoff' },
  PCD: { code: 'ENSEPCD', designation: 'Prise double 2P+T 220V', groupe: 'Prises', protection: 'P', socles: 2 },
  PCD_CUISINE: { code: 'ENSEPCD', designation: 'Prise double 2P+T 220V (service cuisine)', groupe: 'Prises', protection: 'P', socles: 2 },
  PCD_TV: { code: 'ENSEPCD', designation: 'Prise double 2P+T 220V (tv)', groupe: 'Prises', protection: 'P', socles: 2 },
  PCT: { code: 'ENSEPCT', designation: 'Prise triple 2P+T 220V', groupe: 'Prises', protection: 'P', socles: 3 },
  PCQ: { code: 'ENSEPCQ', designation: 'Prise quadruple 2P+T 220V', groupe: 'Prises', protection: 'P', socles: 4 },
  USB: { code: 'ENSEPUSB', designation: 'Prise usb/c', groupe: 'Prises', protection: 'P', socles: 1 },
  PSOL: { code: 'ENSEPDEP', designation: 'Prise au sol 2P+T 220V celiane legrand (sans fourniture)', groupe: 'Prises', protection: 'P', socles: 2 },
  PCSE: { code: 'ENSEPCSE', designation: 'Prise simple 2P+T 220V étanche céliane blanche', groupe: 'Prises étanches', protection: 'P', socles: 1 },
  PCDEC: { code: 'ENSEPCDEC', designation: 'Prise double 2P+T étanche celiane blanche', groupe: 'Prises étanches', protection: 'P', socles: 2 },
  PCSEP: { code: 'ENSEPCSEP', designation: 'Prise simple 2P+T 220V étanche plexo', groupe: 'Prises étanches', protection: 'P', socles: 1 },
  PDEP: { code: 'ENSEPDEP', designation: 'Prise double 2P+T 220V étanche plexo', groupe: 'Prises étanches', protection: 'P', socles: 2 },

  // --- prises dédiées (un C20 chacune)
  PCDI: { code: 'ENSEPCDI', designation: 'Prise 2P+T 220V directe', groupe: 'Prises dédiées', protection: 'C20' },
  PCDI_FRIGO: PCDI('frigo'),
  PCDI_CONGEL: PCDI('congélateur'),
  PCDI_FOUR: PCDI('four'),
  PCDI_MO: PCDI('micro-ondes'),
  PCDI_LV: PCDI('lave-vaisselle'),
  PCDI_HOTTE: PCDI('hotte'),
  PCDI_CAVE: PCDI('cave à vin'),
  PCDI_GLACONS: PCDI('machine à glaçons'),
  PCDI_CAFE: PCDI('machine à café'),
  PCDI_BOUILLOIRE: PCDI('bouilloire'),
  PCDI_MACHINE: PCDI('machine au sol'),

  // --- électroménager
  PLAQUE: { code: 'ENSEPL', designation: 'Alimentation plaque de cuisson', groupe: 'Électroménager', protection: 'C32', typeA: true },
  LL: { code: 'ENSEML1', designation: 'Alimentation Machine à laver 2P+T 220v', groupe: 'Électroménager', protection: 'C20', typeA: true },
  SL: { code: 'ENSESL', designation: 'Alimentation sèche-linge 2P+T 220V', groupe: 'Électroménager', protection: 'C20' },

  // --- confort
  CLIM: { code: 'ENSECLIM', designation: 'Alimentation climatisation', groupe: 'Confort', protection: 'C16' },
  VMC: { code: 'ENSEVMC', designation: 'Alimentation VMC', groupe: 'Confort', protection: 'C10' },
  VENTILO: { code: 'ENSEVR', designation: 'Alimentation ventilateur', groupe: 'Confort', protection: 'VR', canal: 'onoff', poseMo1: 2, poseDes: 'Pose ventilateur' },
  RIDEAUX: { code: 'ENSEVR', designation: 'Alimentation rideaux', groupe: 'Confort', protection: 'VR', canal: 'jm' },
  STORE: { code: 'ENSEVR', designation: 'Alimentation store', groupe: 'Confort', protection: 'VR', canal: 'jm' },
  VOLET: { code: 'ENSEVR', designation: 'Alimentation volet roulant', groupe: 'Confort', protection: 'VR', canal: 'jm' },
  PORTAIL: { code: 'ENSEVR', designation: 'Alimentation portail', groupe: 'Confort', protection: 'VR', canal: 'onoff' },
  ELE: { code: 'ENSELE', designation: 'Liaison équipotentielle fenêtre salle de bain', groupe: 'Liaisons', protection: null },

  // --- eau chaude, piscine, plomberie
  CE: { code: 'ENSECE', designation: 'Alimentation chauffe eau 220V', groupe: 'Plomberie / piscine', protection: 'C20' },
  CE400: { code: 'ENSECE1', designation: 'Alimentation chauffe eau 400V', groupe: 'Plomberie / piscine', protection: 'TRI' },
  PPIS: { code: 'ENSEPPIS', designation: 'Alimentation pompe Piscine 220V', groupe: 'Plomberie / piscine', protection: 'C16' },
  PPIS400: { code: 'ENSEPISC1', designation: 'Alimentation pompe piscine 400V', groupe: 'Plomberie / piscine', protection: 'TRI' },
  CIT: { code: 'ENSECIT', designation: 'Alimentation pompe citerne 220V', groupe: 'Plomberie / piscine', protection: 'C16' },
  CIT400: { code: 'ENSECIT1', designation: 'Alimentation pompe citerne 400V', groupe: 'Plomberie / piscine', protection: 'TRI' },
  PEV: { code: 'ENSEPEV', designation: 'Alimentation pompe eau de ville 220V', groupe: 'Plomberie / piscine', protection: 'C16' },
  PEV400: { code: 'ENSEPEV1', designation: 'Alimentation pompe eau de ville 400V', groupe: 'Plomberie / piscine', protection: 'TRI' },
  RELEVAGE: { code: 'ENSEPEV', designation: 'Alimentation pompe de relevage', groupe: 'Plomberie / piscine', protection: 'C16' },
  FPIS: { code: 'ENSEFPIS', designation: 'Alimentation filtre piscine 220V', groupe: 'Plomberie / piscine', protection: 'C16' },
  ELCY: { code: 'ENSEELCY', designation: 'Alimentation électrolyse 220V', groupe: 'Plomberie / piscine', protection: 'C16' },
  CEAU: { code: 'ENSECEAU', designation: "Alimentation circulateur d'eau", groupe: 'Plomberie / piscine', protection: 'C16' },
  PAC: { code: 'ENSEPAC', designation: 'Alimentation PAC 220V', groupe: 'Plomberie / piscine', protection: 'C32' },
  FLOTTEUR: { code: 'ENSECLIM', designation: 'Alimentation flotteur citerne', groupe: 'Plomberie / piscine', protection: 'C16' },
  ASSAIN: { code: 'ENSEASC', designation: 'Alimentation tableau assainissement 3g6mm² 220V', groupe: 'Plomberie / piscine', protection: 'C32' },
  TP: { code: 'ENSETP', designation: 'Mise à la terre ferraillage piscine et sertissage sur le pool terre, cablette de cuivre nu 35mm²', groupe: 'Plomberie / piscine', protection: null },

  // --- spa / fitness
  JACUZZI: { code: 'ENSEASC', designation: 'Alimentation jacuzzi 3g6mm² 220V', groupe: 'Spa / fitness', protection: 'C32' },
  SAUNA: { code: 'ENSEASC', designation: 'Alimentation sauna 3g6mm² 220V', groupe: 'Spa / fitness', protection: 'C32' },
  BASSIN: { code: 'ENSEASC', designation: 'Alimentation bassin froid 3g6mm² 220V', groupe: 'Spa / fitness', protection: 'C32' },

  // --- local technique
  ALIMEDF: { code: 'ENSEALIMEDF', designation: 'Alimentation EDF vers TGBT 2X16mm² SOUS TPC 63mm² noir.' + NOTE_ML, groupe: 'Local technique', protection: null },
  ALIMEDF4: { code: 'ENSEALIMEDF', designation: 'Alimentation EDF vers TGBT 4X16mm² SOUS TPC 63mm² noir.' + NOTE_ML, groupe: 'Local technique', protection: null },
  ONDULEUR: { code: 'ENSEEDFONDU', designation: 'Alimentation onduleur vers TGBT 2x16mm² sous tpc de 63mm² noir.' + NOTE_ML, groupe: 'Local technique', protection: null },
  ENRMONO: { code: 'ENSEENRMONO', designation: 'Branchement alimentation dans le tableau Solaire monophasé', groupe: 'Local technique', protection: null },
  ENRTRI: { code: 'ENSEENRTRI', designation: 'Branchement alimentation dans le tableau Solaire tétra', groupe: 'Local technique', protection: null },
  BAIE: { code: 'ENSEBAIE', designation: 'Alimentation baie informatique', groupe: 'Local technique', protection: 'C32' },
  DRV220: { code: 'ENSEASC', designation: 'Alimentation DRV 3g6mm² 220V', groupe: 'Local technique', protection: 'C32' },
  DRV400: { code: 'ENSEASC1', designation: 'Alimentation DRV 400V 5G6MM² avec coupure', groupe: 'Local technique', protection: 'TRI' },
  MONTECHARGE: { code: 'ENSEASC', designation: 'Alimentation monte-charge 3g6mm² 220V', groupe: 'Local technique', protection: 'C32' },
  ASCENSEUR: { code: 'ENSEASC1', designation: 'Alimentation ascenseur 400V 5G6MM²', groupe: 'Local technique', protection: 'TRI' },
  GE: { code: 'ENSEVR', designation: 'Alimentation GE analyse du groupe', groupe: 'Local technique', protection: 'C10' },
  TERRE_GE: { code: 'ENSETP', designation: 'Mise à la terre et sertissage GE cablette de cuivre nu 35mm²', groupe: 'Local technique', protection: null },
};

/** Types de luminaires proposés pour les circuits d'éclairage. */
export const LUMINAIRES: Record<string, { label: string; lieu: 'int' | 'ext'; pose: 'std' | 'led_facile' | 'aucune' }> = {
  spot: { label: 'Spot', lieu: 'int', pose: 'std' },
  led: { label: 'LED', lieu: 'int', pose: 'led_facile' },
  suspente: { label: 'Suspente', lieu: 'int', pose: 'std' },
  applique: { label: 'Applique', lieu: 'int', pose: 'std' },
  charpente: { label: 'Spot charpente', lieu: 'int', pose: 'std' },
  liseuse: { label: 'Liseuse', lieu: 'int', pose: 'std' },
  balise: { label: 'Balise nuit', lieu: 'int', pose: 'std' },
  miroir: { label: 'Miroir', lieu: 'int', pose: 'aucune' },
  neon: { label: 'Néon', lieu: 'int', pose: 'std' },
  plafonnier: { label: 'Plafonnier', lieu: 'int', pose: 'std' },
  spot_sol: { label: 'Spot au sol', lieu: 'ext', pose: 'std' },
  piquet: { label: 'Spot piquet', lieu: 'ext', pose: 'std' },
  balisage: { label: 'Balisage cheminement', lieu: 'ext', pose: 'std' },
  marche: { label: 'LED marche', lieu: 'ext', pose: 'std' },
  borne: { label: 'Borne', lieu: 'ext', pose: 'std' },
  transfo: { label: 'Transformateur spot piscine', lieu: 'ext', pose: 'aucune' },
  autre: { label: 'Autre', lieu: 'int', pose: 'std' },
};

export const HEURES_POSE: Record<string, number | null> = {
  std: 1, led_facile: 1, led_difficile: 2, aucune: null,
};

// ---- Tableaux : contenu minimum des ensembles (ce qui est déjà facturé)

export const PROTECTIONS: Record<string, { label: string; ref: string }> = {
  C10: { label: 'Disjoncteur DNX3 1P+N C10', ref: 'Leg 406782' },
  C16: { label: 'Disjoncteur DNX3 1P+N C16', ref: 'Leg 406783' },
  C20: { label: 'Disjoncteur DNX3 1P+N C20', ref: 'Leg 406784' },
  C32: { label: 'Disjoncteur DNX3 1P+N C32', ref: 'Leg 406786' },
  IDAC: { label: 'Interrupteur différentiel DX3-ID 2P 63A 30mA type AC', ref: 'Leg 411650' },
  IDA: { label: 'Interrupteur différentiel DX3-ID 2P 63A 30mA type A', ref: 'Leg 411651' },
  D32: { label: 'Disjoncteur différentiel DX3 1P+N C32 300mA (départ TD 6mm²)', ref: 'Leg 410728' },
  D40: { label: 'Disjoncteur différentiel DX3 1P+N C40 300mA (départ TD 10mm²)', ref: 'Leg 410729' },
};
export const ORDRE_PROTECTIONS = ['C10', 'C16', 'C20', 'C32', 'IDAC', 'IDA', 'D32', 'D40'];

export interface ModeleTableau {
  code: string;
  designation: string;
  calculable: boolean;                                // false = tétra, à faire dans Esabora
  base: Record<string, { q: number; ref?: string }>;  // quantités incluses (ref si différente)
  capacite?: number;                                  // modules disponibles dans le coffret (si connu)
  fixes?: { label: string; modules: number }[];       // appareils fixes de l'ensemble (pour le schéma)
}

/** Largeur en modules des protections (pour le schéma du tableau). */
export const MODULES_PROTECTION: Record<string, number> = { C10: 1, C16: 1, C20: 1, C32: 1, IDAC: 2, IDA: 2, D32: 2, D40: 2 };

export const TABLEAUX: Record<string, ModeleTableau> = {
  TD_MONO: {
    code: 'ENSETD1', designation: 'Tableau TD monophasé', calculable: true,
    base: { C10: { q: 1 }, C16: { q: 1 }, C20: { q: 1 }, C32: { q: 1 }, IDAC: { q: 1 }, IDA: { q: 1 } },
    capacite: 39, fixes: [{ label: 'IS 63A', modules: 2 }, { label: 'TL 16A', modules: 1 }],
  },
  TD_PLOMB: {
    code: 'ENSETDPLOMB', designation: 'Tableau local Plomberie monophasé', calculable: true,
    base: { C10: { q: 3, ref: 'Leg 406773' }, C16: { q: 9, ref: 'Leg 406774' }, C32: { q: 1 }, IDAC: { q: 3 } },
    fixes: [{ label: 'IS 32A', modules: 2 }, { label: 'Horloge', modules: 1 }],
  },
  TD_TETRA: { code: 'ENSETD3', designation: 'Tableau TD tétra', calculable: false, base: {} },
  TD_PLOMB_TETRA: { code: 'ENSETDPLOMB', designation: 'Tableau local Plomberie tétra', calculable: false, base: {} },
  TGBT_MONO: {
    code: 'ENSETGBT', designation: 'Tableau TGBT monophasé', calculable: true,
    base: { C10: { q: 7 }, C16: { q: 11 }, IDA: { q: 3 }, D32: { q: 3 } },
    fixes: [{ label: 'IS 100A', modules: 2 }],
  },
  TGBT_TETRA: { code: 'ENSETGBTT', designation: 'Tableau TGBT tétra', calculable: false, base: {} },
};

export const ALIM_TD: Record<string, { code: string; designation: string }> = {
  'mono-6': { code: 'ENSEALIMTD', designation: 'Alimentation TD vers TGBT 3G6mm² sous tpc 40 rouge.' + NOTE_ML },
  'mono-10': { code: 'ENSEALIMTD2', designation: 'Alimentation TD vers TGBT 3G10mm² sous tpc de 40 rouge.' + NOTE_ML },
  'tetra-6': { code: 'ENSEALIMTD1', designation: 'Alimentation TD vers TGBT 5G6mm² sous tpc de 40 rouge.' + NOTE_ML },
  'tetra-10': { code: 'ENSEALIMTD3', designation: 'Alimentation TD vers TGBT 5g10mm² sous tpc 40 rouge.' + NOTE_ML },
};

// ---- Domotique : désignations des lignes du bloc. Les prix, coefficients et heures ne sont PAS dans le code :
// ils sont saisis par un administrateur (Utilisateurs et prix) ou importés depuis un fichier, et vivent en base.
const ligneVide = (designation: string) => ({ designation, pu: 0, coefMat: 1, coefMo: 1, heures: 0 });
export const DOMOTIQUE_DEFAUT: Record<string, { designation: string; pu: number; coefMat: number; coefMo: number; heures: number }> = {
  TA2: ligneVide("Module d'entrée TA 2 S (inter 2 boutons)"),
  TA4: ligneVide("Module d'entrée TA 4 S (inter 4 boutons)"),
  RM4: ligneVide('Module RM 4 sorties on/off tableau'),
  RM8: ligneVide('Module RM 8 S sorties on/off tableau'),
  RM16: ligneVide('Module RM 16 sorties on/off tableau'),
  SM4: ligneVide('Module SM 4 variation 1-10V tableau'),
  DM4T: ligneVide('Module DM 4 T variation 230V tableau'),
  DALI: ligneVide('Module DM 4 DALI tableau'),
  JM4T: ligneVide('Module JM 4 T stores / rideaux / volets tableau'),
  HORL: ligneVide('Horloge domotique tableau'),
  USB: ligneVide('Interface usb/knx tableau'),
  IP: ligneVide('Interface ip/knx tableau'),
  ALIM: ligneVide('Alimentation 640mA tableau'),
  COUPURE: ligneVide('Interrupteur pour coupure extérieur (client / pas client)'),
  ETS: ligneVide('Programmation avec logiciel ETS6 (test, adressage)'),
};
export const ORDRE_DOMOTIQUE = ['TA2', 'TA4', 'RM4', 'RM8', 'RM16', 'SM4', 'DM4T', 'DALI', 'JM4T', 'HORL', 'USB', 'IP', 'ALIM'];

export const DIVERS_MODELES = [
  'Consuel',
  'Réunion, études, modification recollement sur plan, suivi et approvisionnement chantier.',
  'Coffret de chantier monophasé avec coffret S20 sous TPC de 40 rouge, mise en place et contrôle de sécurité',
  "Mise en place d'un échafaudage pour la durée du chantier",
  'Branchement boite de raccordement extérieur et intérieur (regard, transformateur)',
  'Dossier DOE',
];
