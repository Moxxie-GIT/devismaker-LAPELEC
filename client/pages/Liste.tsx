import { useEffect, useMemo, useState } from 'react';
import type { Devis, DevisResume } from '../../shared/types';
import { del, get, post } from '../lib/api';
import { Barre, useApp } from '../lib/app';
import { Confirmer, Fenetre, dateCourte, toast } from '../lib/ui';

type Ligne = DevisResume & { presents: string[] };

export function Liste() {
  const { naviguer, utilisateur, params } = useApp();
  const [liste, setListe] = useState<Ligne[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [filtre, setFiltre] = useState('');
  const [mesDevis, setMesDevis] = useState(false);
  const [creation, setCreation] = useState(false);
  const [aSupprimer, setASupprimer] = useState<Ligne | null>(null);

  const charger = () => get<Ligne[]>('/api/devis').then(setListe).catch((e) => setErreur(e.message));
  useEffect(() => { charger(); const t = setInterval(charger, 30_000); return () => clearInterval(t); }, []);

  const visibles = useMemo(() => {
    const f = filtre.trim().toLowerCase();
    return (liste ?? []).filter((d) =>
      (!mesDevis || d.createdBy === utilisateur.nom) &&
      (!f || `${d.titre} ${d.client} ${d.reference}`.toLowerCase().includes(f)));
  }, [liste, filtre, mesDevis, utilisateur.nom]);

  const dupliquer = async (d: Ligne) => {
    try { const n = await post<Devis>(`/api/devis/${d.id}/dupliquer`); toast('Devis dupliqué'); naviguer(`/devis/${n.id}`); }
    catch (e: any) { setErreur(e.message); }
  };

  return (
    <>
      <Barre />
      <main className="page">
        <div className="entete-page">
          <div>
            <h1>Devis</h1>
            <p className="discret">Chaque devis génère le fichier à importer dans Esabora.</p>
          </div>
          <button className="btn primaire" onClick={() => setCreation(true)}>Nouveau devis</button>
        </div>
        {erreur && <div className="message erreur" style={{ marginBottom: 12 }}>{erreur}</div>}
        {!(params.tauxMo > 0) && (
          <div className="message attention" style={{ marginBottom: 12 }}>
            Les prix ne sont pas encore réglés (taux de main d’œuvre à 0 €).{' '}
            {utilisateur.role === 'admin'
              ? <button className="lien" onClick={() => naviguer('/parametres')}>Les renseigner ou importer un fichier de prix</button>
              : 'Demande à un administrateur de les renseigner.'}
          </div>
        )}
        <div className="bloc">
          <header>
            <input type="text" placeholder="Rechercher un titre, un client…" value={filtre} onChange={(e) => setFiltre(e.target.value)} style={{ flex: '1 1 260px', maxWidth: 360 }} aria-label="Rechercher" />
            <label className="petit" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={mesDevis} onChange={(e) => setMesDevis(e.target.checked)} /> Seulement mes devis
            </label>
          </header>
          {liste === null ? <div className="vide">Chargement…</div> : visibles.length === 0 ? (
            <div className="vide">
              {liste.length === 0 ? (<><h3>Aucun devis pour l’instant</h3><p>Crée le premier : tu ajouteras ensuite les pièces une par une.</p></>)
                : <p>Aucun devis ne correspond à la recherche.</p>}
            </div>
          ) : (
            <table className="liste">
              <thead>
                <tr><th>Devis</th><th className="masquer-mobile">Pièces</th><th className="masquer-mobile">Créé par</th><th>Dernière modification</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {visibles.map((d) => (
                  <tr key={d.id} className="cliquable" onClick={() => naviguer(`/devis/${d.id}`)}>
                    <td>
                      <div className="titre-devis">{d.titre}</div>
                      <div className="petit discret">{[d.client, d.reference && `n° ${d.reference}`].filter(Boolean).join(', ') || 'Client non renseigné'}</div>
                      {d.presents.length > 0 && <span className="pastille" style={{ marginTop: 4 }}>Ouvert par {d.presents.join(', ')}</span>}
                    </td>
                    <td className="num masquer-mobile">{d.nbPieces}</td>
                    <td className="masquer-mobile">{d.createdBy}</td>
                    <td><span className="petit">{dateCourte(d.updatedAt)}</span><div className="petit discret">par {d.updatedBy}</div></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn fantome petit" onClick={() => dupliquer(d)}>Dupliquer</button>
                      {(d.createdBy === utilisateur.nom || utilisateur.role === 'admin') &&
                        <button className="btn fantome petit" onClick={() => setASupprimer(d)}>Supprimer</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
      {creation && <NouveauDevis onFermer={() => setCreation(false)} />}
      {aSupprimer && (
        <Confirmer
          titre="Supprimer ce devis ?" danger action="Supprimer le devis"
          texte={<>« {aSupprimer.titre} » disparaîtra de la liste pour toute l’équipe.</>}
          onNon={() => setASupprimer(null)}
          onOui={async () => {
            const d = aSupprimer; setASupprimer(null);
            try { await del(`/api/devis/${d.id}`); toast('Devis supprimé'); charger(); } catch (e: any) { setErreur(e.message); }
          }}
        />
      )}
    </>
  );
}

function NouveauDevis({ onFermer }: { onFermer: () => void }) {
  const { naviguer } = useApp();
  const [titre, setTitre] = useState('');
  const [client, setClient] = useState('');
  const [reference, setReference] = useState('');
  const [erreur, setErreur] = useState('');
  return (
    <Fenetre titre="Nouveau devis" onFermer={onFermer}>
      <form onSubmit={async (e) => {
        e.preventDefault(); setErreur('');
        try { const d = await post<Devis>('/api/devis', { titre, client, reference }); naviguer(`/devis/${d.id}`); }
        catch (x: any) { setErreur(x.message); }
      }}>
        {erreur && <div className="message erreur">{erreur}</div>}
        <div className="champ"><label htmlFor="nd-t">Titre</label><input id="nd-t" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Devis CFO villa Les Hibiscus" required /></div>
        <div className="champ"><label htmlFor="nd-c">Client</label><input id="nd-c" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Code client Esabora" /></div>
        <div className="champ"><label htmlFor="nd-r">N° de devis Esabora</label><input id="nd-r" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Facultatif" /></div>
        <div className="boutons"><button type="button" className="btn" onClick={onFermer}>Annuler</button><button className="btn primaire">Créer le devis</button></div>
      </form>
    </Fenetre>
  );
}
