import { useEffect, useState } from 'react';
import type { Parametres as P, Utilisateur } from '../../shared/types';
import { ORDRE_DOMOTIQUE } from '../../shared/lots/cfo/catalogue';
import { fusionnerParametres } from '../../shared/lots';
import { get, post, put } from '../lib/api';
import { Barre, useApp } from '../lib/app';
import { ChampNombre, Fenetre, Segments, toast } from '../lib/ui';

export function Parametres() {
  const { utilisateur } = useApp();
  const [onglet, setOnglet] = useState<'utilisateurs' | 'prix'>('utilisateurs');
  if (utilisateur.role !== 'admin') return (<><Barre /><main className="page"><div className="message erreur">Page réservée aux administrateurs.</div></main></>);
  return (
    <>
      <Barre />
      <main className="page">
        <div className="entete-page">
          <div><h1>Utilisateurs et prix</h1><p className="discret">Réglages communs à toute l’équipe.</p></div>
          <Segments<'utilisateurs' | 'prix'> label="Section" valeur={onglet} options={[['utilisateurs', 'Utilisateurs'], ['prix', 'Prix et coefficients']]} onChange={setOnglet} />
        </div>
        {onglet === 'utilisateurs' ? <Utilisateurs /> : <Prix />}
      </main>
    </>
  );
}

function Utilisateurs() {
  const { utilisateur } = useApp();
  const [liste, setListe] = useState<Utilisateur[]>([]);
  const [erreur, setErreur] = useState('');
  const [creation, setCreation] = useState(false);
  const [mdpPour, setMdpPour] = useState<Utilisateur | null>(null);
  useEffect(() => { get<Utilisateur[]>('/api/utilisateurs').then(setListe).catch((e) => setErreur(e.message)); }, []);
  const modifierU = async (u: Utilisateur, champs: Partial<Utilisateur> & { motDePasse?: string }) => {
    setErreur('');
    try { setListe(await put<Utilisateur[]>(`/api/utilisateurs/${u.id}`, champs)); toast('Utilisateur mis à jour'); }
    catch (e: any) { setErreur(e.message); }
  };
  return (
    <div className="bloc">
      <header><h2>Comptes</h2><button className="btn primaire petit" onClick={() => setCreation(true)}>Créer un compte</button></header>
      {erreur && <div className="message erreur" style={{ margin: 12 }}>{erreur}</div>}
      <table className="liste">
        <thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {liste.map((u) => (
            <tr key={u.id}>
              <td><b>{u.nom}</b>{!u.actif && <> <span className="pastille inactif">désactivé</span></>}</td>
              <td>{u.login}</td>
              <td>
                <select aria-label={`Rôle de ${u.nom}`} value={u.role} onChange={(e) => modifierU(u, { role: e.target.value as Utilisateur['role'] })}>
                  <option value="user">Utilisateur</option><option value="admin">Administrateur</option>
                </select>
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn fantome petit" onClick={() => setMdpPour(u)}>Nouveau mot de passe</button>
                {u.id !== utilisateur.id && (
                  <button className="btn fantome petit" onClick={() => modifierU(u, { actif: !u.actif })}>{u.actif ? 'Désactiver' : 'Réactiver'}</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {creation && <CreerCompte onFermer={() => setCreation(false)} onCree={(l) => { setListe(l); setCreation(false); toast('Compte créé'); }} />}
      {mdpPour && <NouveauMdp u={mdpPour} onFermer={() => setMdpPour(null)} onValider={async (m) => { await modifierU(mdpPour, { motDePasse: m }); setMdpPour(null); }} />}
    </div>
  );
}

function CreerCompte({ onFermer, onCree }: { onFermer: () => void; onCree: (l: Utilisateur[]) => void }) {
  const [login, setLogin] = useState(''); const [nom, setNom] = useState(''); const [mdp, setMdp] = useState(''); const [role, setRole] = useState('user');
  const [erreur, setErreur] = useState('');
  return (
    <Fenetre titre="Créer un compte" onFermer={onFermer}>
      <form onSubmit={async (e) => {
        e.preventDefault(); setErreur('');
        try { onCree(await post<Utilisateur[]>('/api/utilisateurs', { login, nom, motDePasse: mdp, role })); } catch (x: any) { setErreur(x.message); }
      }}>
        {erreur && <div className="message erreur">{erreur}</div>}
        <div className="champ"><label htmlFor="cc-n">Nom affiché</label><input id="cc-n" value={nom} onChange={(e) => setNom(e.target.value)} required /></div>
        <div className="champ"><label htmlFor="cc-l">Identifiant</label><input id="cc-l" value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="off" /><span className="aide">Lettres, chiffres, point, tiret, @.</span></div>
        <div className="champ"><label htmlFor="cc-m">Mot de passe provisoire</label><input id="cc-m" type="text" value={mdp} onChange={(e) => setMdp(e.target.value)} required autoComplete="off" /><span className="aide">8 caractères minimum. La personne pourra le changer depuis son menu.</span></div>
        <div className="champ"><label htmlFor="cc-r">Rôle</label><select id="cc-r" value={role} onChange={(e) => setRole(e.target.value)}><option value="user">Utilisateur</option><option value="admin">Administrateur (gère les comptes et les prix)</option></select></div>
        <div className="boutons"><button type="button" className="btn" onClick={onFermer}>Annuler</button><button className="btn primaire">Créer le compte</button></div>
      </form>
    </Fenetre>
  );
}

function NouveauMdp({ u, onFermer, onValider }: { u: Utilisateur; onFermer: () => void; onValider: (m: string) => void }) {
  const [m, setM] = useState('');
  return (
    <Fenetre titre={`Nouveau mot de passe pour ${u.nom}`} onFermer={onFermer}>
      <form onSubmit={(e) => { e.preventDefault(); onValider(m); }}>
        <div className="champ"><label htmlFor="nm">Mot de passe provisoire</label><input id="nm" type="text" value={m} onChange={(e) => setM(e.target.value)} required autoComplete="off" /><span className="aide">8 caractères minimum. Ses sessions ouvertes seront fermées.</span></div>
        <div className="boutons"><button type="button" className="btn" onClick={onFermer}>Annuler</button><button className="btn primaire">Changer le mot de passe</button></div>
      </form>
    </Fenetre>
  );
}

function Prix() {
  const { params, setParams } = useApp();
  const [p, setP] = useState<P>(structuredClone(params));
  const [erreur, setErreur] = useState('');
  const [modeles, setModeles] = useState(params.diversModeles.join('\n'));
  const majD = (k: string, champ: string, v: any) => setP((x) => { const n = structuredClone(x); (n.domotique[k] as any)[champ] = v; return n; });
  const enregistrer = async () => {
    setErreur('');
    try {
      const n = await put<P>('/api/parametres', { ...p, diversModeles: modeles.split('\n').map((s) => s.trim()).filter(Boolean) });
      setParams(n); setP(structuredClone(n)); toast('Prix enregistrés');
    } catch (e: any) { setErreur(e.message); }
  };
  const importer = async (f: File) => {
    setErreur('');
    try {
      const n = fusionnerParametres(JSON.parse(await f.text()));
      setP(n); setModeles(n.diversModeles.join('\n'));
      toast('Fichier chargé : vérifie les valeurs puis enregistre');
    } catch { setErreur('Fichier illisible : il faut un fichier de prix (.json) exporté depuis cet écran.'); }
  };
  const exporter = () => {
    const contenu = { ...p, diversModeles: modeles.split('\n').map((s) => s.trim()).filter(Boolean) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(contenu, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'prix-devis.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const cles = [...ORDRE_DOMOTIQUE, 'COUPURE', 'ETS'];
  return (
    <>
      {erreur && <div className="message erreur" style={{ marginBottom: 12 }}>{erreur}</div>}
      <div className="bloc">
        <header><h2>Fichier de prix</h2></header>
        <div className="corps">
          <p className="discret" style={{ marginBottom: 10 }}>Les prix ne sont pas dans le code de l’outil : ils sont enregistrés uniquement dans la base du serveur. Tu peux les sauvegarder dans un fichier ou les recharger depuis un fichier.</p>
          <div className="pied-section">
            <label className="btn">Importer un fichier de prix…
              <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importer(f); e.target.value = ''; }} />
            </label>
            <button className="btn" onClick={exporter}>Exporter les prix</button>
          </div>
        </div>
      </div>
      <div className="bloc">
        <header><h2>Main d’œuvre</h2></header>
        <div className="corps formulaire-ligne">
          <div className="champ" style={{ flex: '0 0 auto' }}><label>Taux M.O. (€/h)</label><ChampNombre label="Taux de main d’œuvre" valeur={p.tauxMo} onChange={(n) => setP({ ...p, tauxMo: n ?? 0 })} /></div>
          <div className="champ" style={{ flex: '0 0 auto' }}><label>Coef M.O. des lignes Divers</label><ChampNombre label="Coefficient de main d’œuvre" valeur={p.coefMo} onChange={(n) => setP({ ...p, coefMo: n ?? 0 })} /></div>
        </div>
      </div>
      <div className="bloc">
        <header><h2>Bloc Domotique</h2><p className="petit discret">Lignes libres exportées telles quelles (en attendant les références de la liste matériel).</p></header>
        <div className="corps" style={{ overflowX: 'auto' }}>
          <table className="grille">
            <thead><tr><th>Désignation</th><th>Prix achat</th><th>Coef mat.</th><th>Coef M.O.</th><th>Heures</th></tr></thead>
            <tbody>
              {cles.map((k) => (
                <tr key={k}>
                  <td className="l"><input aria-label={`Désignation ${k}`} value={p.domotique[k].designation} onChange={(e) => majD(k, 'designation', e.target.value)} /></td>
                  <td><ChampNombre label="Prix" valeur={p.domotique[k].pu} onChange={(n) => majD(k, 'pu', n ?? 0)} /></td>
                  <td><ChampNombre label="Coef mat." largeur={70} valeur={p.domotique[k].coefMat} onChange={(n) => majD(k, 'coefMat', n ?? 0)} /></td>
                  <td><ChampNombre label="Coef M.O." largeur={70} valeur={p.domotique[k].coefMo} onChange={(n) => majD(k, 'coefMo', n ?? 0)} /></td>
                  <td>{k === 'ETS' ? <span className="petit discret">par devis</span> : <ChampNombre label="Heures" largeur={70} valeur={p.domotique[k].heures} onChange={(n) => majD(k, 'heures', n ?? 0)} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bloc">
        <header><h2>Lignes Divers proposées</h2><p className="petit discret">Une par ligne. Elles sont ajoutées à chaque nouveau devis, prix et heures à renseigner.</p></header>
        <div className="corps"><textarea style={{ width: '100%', minHeight: 150 }} value={modeles} onChange={(e) => setModeles(e.target.value)} /></div>
      </div>
      <div className="pied-section" style={{ marginTop: 16 }}><button className="btn primaire" onClick={enregistrer}>Enregistrer les prix</button></div>
    </>
  );
}
