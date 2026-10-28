import './styles.css';
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { Parametres as P, Utilisateur } from '../shared/types';
import { get, quandDeconnecte } from './lib/api';
import { AppCtx, seDeconnecter, useChemin } from './lib/app';
import { ZoneToast } from './lib/ui';
import { Connexion } from './pages/Connexion';
import { Liste } from './pages/Liste';
import { Editeur } from './pages/Editeur';
import { Parametres } from './pages/Parametres';

interface Etat { version: string; setupRequis: boolean; utilisateur: Utilisateur | null }

function App() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [params, setParams] = useState<P | null>(null);
  const [erreur, setErreur] = useState('');
  const [chemin, naviguer] = useChemin();
  const [nouvelleVersion, setNouvelleVersion] = useState(false);

  // une mise à jour a été installée sur le serveur pendant que la page était ouverte ?
  useEffect(() => {
    if (!etat?.version) return;
    const verifier = () => get<Etat>('/api/etat').then((e) => { if (e.version !== etat.version) setNouvelleVersion(true); }).catch(() => {});
    const t = setInterval(verifier, 180_000);
    const auRetour = () => { if (document.visibilityState === 'visible') verifier(); };
    document.addEventListener('visibilitychange', auRetour);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', auRetour); };
  }, [etat?.version]);

  const charger = async () => {
    try {
      const e = await get<Etat>('/api/etat');
      setEtat(e);
      if (e.utilisateur) setParams(await get<P>('/api/parametres'));
      setErreur('');
    } catch (x: any) { setErreur(x.message); }
  };
  useEffect(() => { charger(); quandDeconnecte(() => setEtat((e) => (e ? { ...e, utilisateur: null } : e))); }, []);

  if (erreur) return <main className="ecran-connexion"><div className="message erreur">{erreur} <button className="btn petit" onClick={charger}>Réessayer</button></div></main>;
  if (!etat) return null;
  if (!etat.utilisateur || !params) return <Connexion premierLancement={etat.setupRequis} onConnecte={charger} />;

  const ctx = {
    utilisateur: etat.utilisateur, params, setParams, version: etat.version, naviguer,
    deconnecter: async () => { await seDeconnecter(); setEtat({ ...etat, utilisateur: null }); naviguer('/'); },
  };
  const m = /^\/devis\/([\w-]+)/.exec(chemin);
  return (
    <AppCtx.Provider value={ctx}>
      {m ? <Editeur key={m[1]} id={m[1]} /> : chemin.startsWith('/parametres') ? <Parametres /> : <Liste />}
      <ZoneToast />
      {nouvelleVersion && (
        <div className="bandeau-maj" role="status">
          <span>Une nouvelle version de l’outil vient d’être installée. Recharge la page pour l’utiliser : ton travail est enregistré.</span>
          <button className="btn petit" onClick={() => location.reload()}>Recharger</button>
        </div>
      )}
    </AppCtx.Provider>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
