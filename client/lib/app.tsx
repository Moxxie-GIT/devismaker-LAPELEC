// Contexte de l'application : utilisateur connecté, paramètres, navigation.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Parametres, Utilisateur } from '../../shared/types';
import { post, put } from './api';
import { Fenetre, toast } from './ui';

export interface Ctx {
  utilisateur: Utilisateur;
  params: Parametres;
  setParams: (p: Parametres) => void;
  version: string;
  naviguer: (chemin: string) => void;
  deconnecter: () => void;
}

export const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export function useChemin(): [string, (c: string) => void] {
  const [chemin, setChemin] = useState(location.pathname);
  useEffect(() => {
    const f = () => setChemin(location.pathname);
    window.addEventListener('popstate', f);
    return () => window.removeEventListener('popstate', f);
  }, []);
  const naviguer = (c: string) => {
    if (c === location.pathname) return;
    const ev = new CustomEvent('avant-navigation', { cancelable: true });
    if (!window.dispatchEvent(ev)) return;
    history.pushState(null, '', c);
    setChemin(c);
    window.scrollTo(0, 0);
  };
  return [chemin, naviguer];
}

export function Lien({ vers, children, className }: { vers: string; children: ReactNode; className?: string }) {
  const { naviguer } = useApp();
  return (
    <a href={vers} className={className} onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault(); naviguer(vers);
    }}>{children}</a>
  );
}

export function Marque({ lot = true }: { lot?: boolean }) {
  return (
    <span className="marque"><span className="terre" aria-hidden="true" />LAPELEC Devis{lot && <span className="lot">CFO</span>}</span>
  );
}

export function Barre({ children }: { children?: ReactNode }) {
  const { utilisateur, deconnecter, naviguer, version } = useApp();
  const [ouvert, setOuvert] = useState(false);
  const [mdp, setMdp] = useState(false);
  useEffect(() => {
    if (!ouvert) return;
    const f = () => setOuvert(false);
    setTimeout(() => window.addEventListener('click', f, { once: true }));
    return () => window.removeEventListener('click', f);
  }, [ouvert]);
  return (
    <header className="barre">
      <Lien vers="/" className="marque"><span className="terre" aria-hidden="true" />LAPELEC Devis<span className="lot">CFO</span></Lien>
      {children}
      <span className="espace" />
      <div className="menu-util">
        <button className="btn-barre" aria-haspopup="menu" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>{utilisateur.nom}</button>
        {ouvert && (
          <div className="liste" role="menu">
            <div className="qui"><b>{utilisateur.nom}</b><div className="petit discret">{utilisateur.login}{utilisateur.role === 'admin' ? ', administrateur' : ''}</div></div>
            <button role="menuitem" onClick={() => naviguer('/')}>Tous les devis</button>
            {utilisateur.role === 'admin' && <button role="menuitem" onClick={() => naviguer('/parametres')}>Utilisateurs et prix</button>}
            <button role="menuitem" onClick={() => setMdp(true)}>Changer mon mot de passe</button>
            <button role="menuitem" onClick={deconnecter}>Se déconnecter</button>
            <div className="petit discret" style={{ padding: '8px 10px 2px', borderTop: '1px solid var(--trait)', marginTop: 4 }}>Version {version}</div>
          </div>
        )}
      </div>
      {mdp && <ChangerMotDePasse onFermer={() => setMdp(false)} />}
    </header>
  );
}

function ChangerMotDePasse({ onFermer }: { onFermer: () => void }) {
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [erreur, setErreur] = useState('');
  return (
    <Fenetre titre="Changer mon mot de passe" onFermer={onFermer}>
      <form onSubmit={async (e) => {
        e.preventDefault(); setErreur('');
        try { await put('/api/moi/mot-de-passe', { ancien, nouveau }); toast('Mot de passe changé'); onFermer(); }
        catch (x: any) { setErreur(x.message); }
      }}>
        {erreur && <div className="message erreur">{erreur}</div>}
        <div className="champ"><label htmlFor="mdp-a">Mot de passe actuel</label><input id="mdp-a" type="password" autoComplete="current-password" value={ancien} onChange={(e) => setAncien(e.target.value)} /></div>
        <div className="champ"><label htmlFor="mdp-n">Nouveau mot de passe</label><input id="mdp-n" type="password" autoComplete="new-password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} /><span className="aide">8 caractères minimum.</span></div>
        <div className="boutons"><button type="button" className="btn" onClick={onFermer}>Annuler</button><button className="btn primaire">Changer le mot de passe</button></div>
      </form>
    </Fenetre>
  );
}

export async function seDeconnecter() {
  try { await post('/api/deconnexion'); } catch { /* déjà déconnecté */ }
}
