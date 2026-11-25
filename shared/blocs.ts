// Blocs de l'import de lignes Esabora. Réglages : N° Bloc sur la colonne « N° », séparateur « . », « Ajouter ligne
// titre bloc » DÉCOCHÉE. Chaque bloc a un numéro (1, 2… ; 1.1, 1.2… pour les sous-blocs) et s'ouvre par une ligne de
// titre sans quantité, dont Esabora fait le titre du bloc. Case cochée, Esabora prend le numéro comme titre.
// (Vérifié dans Esabora : un nom dans le N°, « Maison 1.Chambre 1 », ne crée pas de sous-bloc.)

export const SEPARATEUR_BLOC = '.';

/** Titre du bloc du logement k : « Maison 1 ». */
export const nomLogement = (nom: string, k: number) => `${nom.trim() || 'Maison'} ${k}`;

/** « Maison 1 et Maison 2 », « Maison 1 à Maison 4 ». */
export const listeLogements = (nom: string, n: number) =>
  `${nomLogement(nom, 1)} ${n === 2 ? 'et' : 'à'} ${nomLogement(nom, n)}`;
