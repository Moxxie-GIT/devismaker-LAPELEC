// Noms de blocs dans l'import de lignes Esabora. La colonne N° donne le nom du bloc, et le séparateur de l'import
// (« . » par défaut) en fait des sous-blocs : « Maison 1.Chambre 1 » crée le bloc Maison 1 et, dedans, le bloc Chambre 1.

export const SEPARATEUR_BLOC = '.';

/** Nom de bloc sans séparateur : un point dans un nom de pièce (« Ch. parents ») créerait un sous-bloc. */
export const nomBloc = (s: string) => s.split(SEPARATEUR_BLOC).join('').replace(/\s+/g, ' ').trim();

/** Bloc du logement k : « Maison 1 ». */
export const nomLogement = (nom: string, k: number) => `${nomBloc(nom) || 'Maison'} ${k}`;

/** « Maison 1 et Maison 2 », « Maison 1 à Maison 4 ». */
export const listeLogements = (nom: string, n: number) =>
  `${nomLogement(nom, 1)} ${n === 2 ? 'et' : 'à'} ${nomLogement(nom, n)}`;

/** N° de bloc lisible : « Maison 1 › Chambre 1 ». */
export const libelleBloc = (bloc: string) => bloc.split(SEPARATEUR_BLOC).join(' › ');
