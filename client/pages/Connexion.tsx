import { useState } from 'react';
import { post } from '../lib/api';
import { Marque } from '../lib/app';

export function Connexion({ premierLancement, onConnecte }: { premierLancement: boolean; onConnecte: () => void }) {
  const [login, setLogin] = useState('');
  const [nom, setNom] = useState('');
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    if (premierLancement && mdp !== mdp2) { setErreur('Les deux mots de passe ne sont pas identiques.'); return; }
    setEnvoi(true);
    try {
      if (premierLancement) await post('/api/setup', { login, nom, motDePasse: mdp });
      else await post('/api/connexion', { login, motDePasse: mdp });
      onConnecte();
    } catch (x: any) {
      setErreur(x.message);
      setEnvoi(false);
    }
  };

  return (
    <main className="ecran-connexion">
      <div className="carte-connexion">
        <Marque />
        {premierLancement ? (
          <>
            <h1>Premier lancement</h1>
            <p className="discret" style={{ margin: '6px 0 18px' }}>Crée le compte administrateur. Il servira ensuite à créer les comptes de l’équipe.</p>
          </>
        ) : (
          <h1 style={{ marginBottom: 18 }}>Connexion</h1>
        )}
        <form onSubmit={envoyer}>
          {erreur && <div className="message erreur" role="alert">{erreur}</div>}
          <div className="champ">
            <label htmlFor="login">Identifiant</label>
            <input id="login" autoComplete="username" autoFocus value={login} onChange={(e) => setLogin(e.target.value)} required />
          </div>
          {premierLancement && (
            <div className="champ">
              <label htmlFor="nom">Nom affiché</label>
              <input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Camille Martin" />
            </div>
          )}
          <div className="champ">
            <label htmlFor="mdp">Mot de passe</label>
            <input id="mdp" type="password" autoComplete={premierLancement ? 'new-password' : 'current-password'} value={mdp} onChange={(e) => setMdp(e.target.value)} required />
            {premierLancement && <span className="aide">8 caractères minimum.</span>}
          </div>
          {premierLancement && (
            <div className="champ">
              <label htmlFor="mdp2">Confirmer le mot de passe</label>
              <input id="mdp2" type="password" autoComplete="new-password" value={mdp2} onChange={(e) => setMdp2(e.target.value)} required />
            </div>
          )}
          <button className="btn primaire" disabled={envoi}>{premierLancement ? 'Créer le compte et entrer' : 'Se connecter'}</button>
        </form>
      </div>
    </main>
  );
}
