// Types partagés entre le serveur et l'interface.

export type Mode = 'KNX' | 'CLASSIQUE';
export type Commande = 'onoff' | 'v110' | 'v230' | 'dali';
export type Pose = 'std' | 'led_facile' | 'led_difficile' | 'aucune';
export type Lieu = 'int' | 'ext';

/** Un circuit d'éclairage : un groupe de points identiques, commandés ensemble. */
export interface Circuit {
  id: string;
  type: string;        // clé du type de luminaire (spot, led, suspente...)
  nom: string;         // texte libre repris dans la désignation, ex. « LED S1 »
  lieu: Lieu;
  nb: number;
  commande: Commande;
  pose: Pose;
}

/** Un équipement de la pièce (prise, alimentation...) tiré du catalogue. */
export interface Element {
  id: string;
  cle: string;         // clé du catalogue
  designation: string; // modifiable
  quantite: number;
}

export type ChoixTableau = 'TD' | 'TGBT' | 'AUCUN';

export interface Tableau {
  choix: ChoixTableau | null;      // null = question pas encore répondue
  phase: 'mono' | 'tetra';
  section: 6 | 10;                 // section de l'alimentation du TD
  modele: 'standard' | 'plomberie';
  alimentePar: string;             // 'TGBT' ou id de la pièce qui porte le TD
}

export interface Piece {
  id: string;
  nom: string;                     // devient le nom du bloc Esabora
  type: string;                    // clé du type de pièce
  tableau: Tableau;
  circuits: Circuit[];
  inters: number[];                // KNX : nombre de boutons de chaque inter
  detecteurs: number;              // KNX
  classique: { sa: number; vv: number; bps: number }; // mode classique
  elements: Element[];
}

export interface LigneLibre {
  id: string;
  designation: string;
  quantite: number;
  pu: number | null;
  coefMat: number | null;
  heures: number | null;
}

export interface Domotique {
  actif: boolean;
  heuresEts: number | null;
  coupure: number;                 // interrupteur de coupure extérieur
}

export interface DevisData {
  mode: Mode;
  pieces: Piece[];
  domotique: Domotique;
  divers: LigneLibre[];
  notes: string;
}

export interface Devis {
  id: string;
  titre: string;
  client: string;
  reference: string;
  lot: string;
  version: number;
  data: DevisData;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DevisResume {
  id: string;
  titre: string;
  client: string;
  reference: string;
  lot: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  nbPieces: number;
}

export interface PrixLigne {
  designation: string;
  pu: number;
  coefMat: number;
  coefMo: number;
  heures: number;
}

export interface Parametres {
  tauxMo: number;
  coefMo: number;
  domotique: Record<string, PrixLigne>;
  diversModeles: string[];
}

export interface Utilisateur {
  id: string;
  login: string;
  nom: string;
  role: 'admin' | 'user';
  actif: boolean;
}

// ---- sortie du moteur ----

export interface LigneImport {
  bloc: string;
  ref: string | null;
  designation: string;
  quantite: number;
  pu?: number | null;
  coefMat?: number | null;
  coefMo?: number | null;
  moUnit?: number | null;
  tauxMo?: number | null;
  unite?: string | null;
}

export interface Protection {
  cle: string;
  label: string;
  ref: string;
  besoin: number;
  base: number;
  final: number;
}

export interface TableauCalcule {
  id: string;              // 'TGBT' ou id de pièce
  nom: string;             // « TD Chambre 1 », « TGBT »
  bloc: string;            // nom du bloc où se trouve l'ensemble
  ensemble: string;        // code Esabora de l'ensemble
  modele: string;          // clé du modèle de tableau (TD_MONO, TGBT_MONO...)
  pieceId: string;         // pièce qui porte le tableau
  calculable: boolean;
  points: number;
  socles: number;
  appareilsVr: number;
  circuitsA: number;
  circuits: number;
  protections: Protection[];
  rattachees: string[];    // noms des pièces alimentées
  detail: string[];
  canaux: Record<string, number>;
  modules: Record<string, number>;
}

export interface Alerte {
  niveau: 'erreur' | 'attention';
  message: string;
  pieceId?: string;
}

export interface Resultat {
  lignes: LigneImport[];
  tableaux: TableauCalcule[];
  aModifier: { bloc: string; tableau: string; ensemble: string; changements: Protection[] }[];
  domotique: { modules: Record<string, number>; participants: number; parInter: { piece: string; inter: number; boutons: number; modules: string }[] } | null;
  alertes: Alerte[];
}
