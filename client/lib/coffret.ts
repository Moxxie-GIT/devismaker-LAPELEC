// Disposition d'un tableau : le calcul est dans shared/ (le moteur s'en sert pour ses contrôles, l'export pour la
// feuille DISPOSITION) ; l'interface l'utilise telle quelle pour le schéma 2D et la vue 3D.
export {
  LIBELLE_ETAT, PAR_RANGEE_DEFAUT, disposer as disposition, type EtatModule, type Mod,
} from '../../shared/lots/cfo/disposition';
