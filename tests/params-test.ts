// Paramètres fictifs pour les tests (les vrais prix ne sont jamais dans le dépôt).
import type { Parametres } from '../shared/types';
import { parametresParDefaut } from '../shared/lots';
import { ORDRE_DOMOTIQUE } from '../shared/lots/cfo/catalogue';

export function paramsTest(): Parametres {
  const p = parametresParDefaut();
  p.tauxMo = 40;
  p.coefMo = 2;
  ORDRE_DOMOTIQUE.forEach((k, i) => { p.domotique[k] = { ...p.domotique[k], pu: 10 * (i + 1), coefMat: 2, coefMo: 2, heures: 0 }; });
  p.domotique.COUPURE = { ...p.domotique.COUPURE, pu: 20, coefMat: 2, coefMo: 2, heures: 1 };
  p.domotique.ETS = { ...p.domotique.ETS, pu: 0, coefMat: 1, coefMo: 4, heures: 0 };
  return p;
}
