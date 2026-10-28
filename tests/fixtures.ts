// Villa de démonstration : la même que le fichier validé par import dans Esabora (prix fictifs).
import type { Circuit, DevisData, Element, Piece } from '../shared/types';

let n = 0;
const id = () => `id${++n}`;
const C = (nom: string, nb: number, opts: Partial<Circuit> = {}): Circuit =>
  ({ id: id(), type: 'autre', nom, lieu: 'int', nb, commande: 'onoff', pose: 'std', ...opts });
const E = (cle: string, quantite: number, designation: string): Element => ({ id: id(), cle, designation, quantite });
const P = (nom: string, type: string, tableau: Partial<Piece['tableau']>, rest: Partial<Piece>): Piece => ({
  id: nom, nom, type,
  tableau: { choix: 'AUCUN', phase: 'mono', section: 6, modele: 'standard', alimentePar: 'TGBT', ...tableau },
  circuits: [], inters: [], detecteurs: 0, classique: { sa: 0, vv: 0, bps: 0 }, elements: [], ...rest,
});

export function villaDemo(): DevisData {
  n = 0;
  return {
    mode: 'KNX',
    notes: '',
    domotique: { actif: true, heuresEts: 20, coupure: 1 },
    pieces: [
      P('Chambre 1', 'chambre', { choix: 'TD', section: 6 }, {
        circuits: [C('spot chambre', 6), C('LED chambre', 1, { commande: 'v110', pose: 'led_facile' }), C('liseuse', 2),
          C('miroir', 1, { pose: 'aucune' }), C('spot salle de bain', 4),
          C('LED salle de bain', 1, { commande: 'v110', pose: 'led_difficile' }), C('spot charpente deck', 2, { lieu: 'ext' })],
        inters: [4, 2, 2, 6], detecteurs: 1,
        elements: [E('PCS', 1, 'Prise simple 2P+T 220V'), E('PCD', 4, 'Prise double 2P+T 220V'), E('USB', 2, 'Prise usb/c'),
          E('PCSE', 1, 'Prise simple 2P+T 220V étanche céliane blanche (salle de bain)'),
          E('PCSEP', 1, 'Prise simple 2P+T 220V étanche plexo (deck)'),
          E('PCDI_FRIGO', 1, 'Prise 2P+T 220V directe (frigo)'), E('PCDI_CAFE', 1, 'Prise 2P+T 220V directe (machine à café)'),
          E('VENTILO', 1, 'Alimentation ventilateur'), E('RIDEAUX', 1, 'Alimentation rideaux'),
          E('CLIM', 1, 'Alimentation climatisation'), E('VMC', 1, 'Alimentation VMC'),
          E('ELE', 1, 'Liaison équipotentielle fenêtre salle de bain'), E('USB', 0, 'ligne à zéro, ignorée')],
      }),
      P('Cuisine', 'cuisine', { choix: 'TD', section: 10 }, {
        circuits: [C('spot cuisine', 5), C('spot îlot', 3, { commande: 'v230' }), C('LED meuble cuisine', 1, { commande: 'v110', pose: 'led_facile' })],
        inters: [4, 2],
        elements: [E('PCDI_FOUR', 1, 'Prise 2P+T 220V directe (four)'), E('PCDI_MO', 1, 'Prise 2P+T 220V directe (micro-ondes)'),
          E('PCDI_LV', 1, 'Prise 2P+T 220V directe (lave-vaisselle)'), E('PCDI_FRIGO', 1, 'Prise 2P+T 220V directe (frigo)'),
          E('PCDI_HOTTE', 1, 'Prise 2P+T 220V directe (hotte)'), E('PLAQUE', 1, 'Alimentation plaque de cuisson'),
          E('PCD_CUISINE', 3, 'Prise double 2P+T 220V (service cuisine)'), E('PCS', 1, 'Prise simple 2P+T 220V'),
          E('CLIM', 1, 'Alimentation climatisation'), E('VMC', 1, 'Alimentation VMC')],
      }),
      P('Salon', 'salon', {}, {
        circuits: [C('LED S1', 6, { commande: 'dali' }), C('Suspente S2', 2)], inters: [4, 2],
        elements: [E('PCD_TV', 1, 'Prise double 2P+T 220V (tv)'), E('PCS', 3, 'Prise simple 2P+T 220V'),
          E('PCS_CMD', 1, 'Prise simple 2P+T 220V (commandée)'),
          E('PSOL', 2, 'Prise au sol 2P+T 220V celiane legrand (sans fourniture)'),
          E('VOLET', 2, 'Alimentation volet roulant'), E('VENTILO', 1, 'Alimentation ventilateur'), E('CLIM', 1, 'Alimentation climatisation')],
      }),
      P('WC invité', 'sdb', {}, {
        circuits: [C('spot wc', 2), C('LED murale', 1, { commande: 'v110', pose: 'led_facile' })], detecteurs: 1,
        elements: [E('PCS', 1, 'Prise simple 2P+T 220V'), E('VMC', 1, 'Alimentation VMC')],
      }),
      P('Terrasse', 'terrasse', {}, {
        circuits: [C('charpente terrasse', 8, { lieu: 'ext' }), C('applique murale', 2, { lieu: 'ext' })], inters: [2],
        elements: [E('PCSEP', 2, 'Prise simple 2P+T 220V étanche plexo'), E('STORE', 2, 'Alimentation store')],
      }),
      P('Local technique', 'local_tech', { choix: 'TGBT' }, {
        circuits: [C('néon', 1)], inters: [1],
        elements: [E('PCS_SERVICE', 1, 'Prise simple 2P+T 220V (service)'), E('BAIE', 1, 'Alimentation baie informatique'),
          E('ASSAIN', 1, 'Alimentation assainissement 3g6mm² 220V'),
          E('ALIMEDF', 1, 'Alimentation EDF vers TGBT 2X16mm² SOUS TPC 63mm² noir. Veuillez noter que le prix est susceptible de varier en fonction du nombre de mètres linéaire réellement réalisé dans le cadre des travaux.')],
      }),
      P('Local plomberie', 'plomberie', {}, {
        circuits: [C('néon', 1), C('transformateur spot piscine', 1, { lieu: 'ext', pose: 'aucune' })], inters: [1],
        elements: [E('PPIS', 1, 'Alimentation pompe Piscine 220V'), E('FPIS', 1, 'Alimentation filtre piscine 220V'),
          E('ELCY', 1, 'Alimentation électrolyse 220V'), E('CIT', 1, 'Alimentation pompe citerne 220V'),
          E('CE', 1, 'Alimentation chauffe eau 220V'),
          E('TP', 1, 'Mise à la terre ferraillage piscine et sertissage sur le pool terre, cablette de cuivre nu 35mm²')],
      }),
      P('Extérieur', 'exterieur', {}, {
        circuits: [C('spot piquet', 10, { lieu: 'ext' }), C('balisage cheminement', 4, { lieu: 'ext' }), C('LED marche', 6, { lieu: 'ext' })],
        detecteurs: 1,
        elements: [E('PCSEP', 2, 'Prise simple 2P+T 220V étanche plexo'), E('PORTAIL', 1, 'Alimentation portail')],
      }),
    ],
    divers: [
      { id: 'd1', designation: 'Consuel', quantite: 1, pu: 50, coefMat: 2, heures: 1 },
      { id: 'd2', designation: 'Réunion, études, modification recollement sur plan, suivi et approvisionnement chantier.', quantite: 1, pu: 0, coefMat: 1, heures: 20 },
      { id: 'd3', designation: 'Coffret de chantier monophasé, mise en place et contrôle de sécurité', quantite: 1, pu: 500, coefMat: 1.5, heures: 4 },
      { id: 'd4', designation: 'Branchement boite de raccordement extérieur et intérieur (regard, transformateur)', quantite: 1, pu: 0, coefMat: 1, heures: 10 },
      { id: 'd5', designation: 'Dossier DOE', quantite: 1, pu: 0, coefMat: 1, heures: 8 },
    ],
  };
}
