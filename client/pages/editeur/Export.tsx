import { useState } from 'react';
import type { Devis, Resultat } from '../../../shared/types';
import { telecharger } from '../../lib/api';
import { toast } from '../../lib/ui';

export function PanneauExport({ devis, resultat, onAller, avantExport, etatSauvegarde }: {
  devis: Devis; resultat: Resultat; onAller: (s: string) => void; avantExport: () => Promise<void>; etatSauvegarde: string;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const erreurs = resultat.alertes.filter((a) => a.niveau === 'erreur');
  const attentions = resultat.alertes.filter((a) => a.niveau === 'attention');
  const blocs = [...new Set(resultat.lignes.map((l) => l.bloc))];

  const exporter = async () => {
    setEnvoi(true); setErreur('');
    try {
      await avantExport();
      await telecharger(`/api/devis/${devis.id}/export`);
      toast('Fichier d’import téléchargé');
    } catch (e: any) {
      setErreur(e.details?.length ? `${e.message} ${e.details.map((d: any) => d.message).join(' ')}` : e.message);
    } finally { setEnvoi(false); }
  };

  return (
    <>
      <div className="titre-piece"><h1>Vérifier et exporter</h1></div>

      <section className="section">
        <header><h2>{erreurs.length ? `${erreurs.length} point${erreurs.length > 1 ? 's' : ''} à corriger avant l’export` : 'Prêt à exporter'}</h2></header>
        {resultat.alertes.length === 0 && <p className="discret">Aucune alerte. {resultat.lignes.length} lignes réparties en {blocs.length} blocs.</p>}
        <div className="alertes">
          {[...erreurs, ...attentions].map((a, i) => (
            <div key={i} className={`alerte ${a.niveau}`}>
              <span className={`point ${a.niveau}`} />
              <span>{a.message}</span>
              {a.pieceId && <button className="btn petit" onClick={() => onAller(a.pieceId!)}>Ouvrir la pièce</button>}
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <header><h2>Import dans Esabora</h2></header>
        <ol className="etapes-export">
          <li>
            <p>Télécharge le fichier d’import.</p>
            <div className="pied-section">
              <button className="btn primaire" disabled={envoi || erreurs.length > 0 || etatSauvegarde === 'conflit'} onClick={exporter}>
                {envoi ? 'Préparation…' : 'Télécharger le fichier d’import'}
              </button>
              <span className="petit discret">{resultat.lignes.length} lignes, {blocs.length} blocs</span>
            </div>
            {erreur && <div className="message erreur" style={{ marginTop: 8 }}>{erreur}</div>}
          </li>
          <li>
            <p>Dans Esabora, importe <b>uniquement la feuille IMPORT</b> avec ces réglages :</p>
            <ul className="petit" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              <li>N° de bloc : colonne « N° », case « Ajouter ligne titre bloc » cochée ;</li>
              <li>Référence : colonne « Référence », case « Rechercher référence » cochée ;</li>
              <li>« Associer lignes avec désignations identiques » décochée ;</li>
              <li>les autres colonnes sur la colonne du même nom.</li>
            </ul>
          </li>
          <li>
            <p>Change les quantités dans les ensembles tableaux :</p>
            {resultat.aModifier.length === 0 ? <p className="petit discret">Rien à changer : les ensembles minimum suffisent.</p> : (
              <table className="liste bloc" style={{ marginTop: 6 }}>
                <tbody>
                  {resultat.aModifier.map((m) => m.changements.map((c, i) => (
                    <tr key={m.tableau + c.cle}>
                      <td>{i === 0 && <b>{m.bloc}, {m.ensemble}</b>}</td>
                      <td>{c.label}<div className="petit discret">{c.ref}</div></td>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>{c.base === 0 ? 'à ajouter' : c.base} → <b>{c.final}</b></td>
                    </tr>
                  )))}
                </tbody>
              </table>
            )}
            <p className="petit discret" style={{ marginTop: 6 }}>Cette liste est aussi dans la feuille « TABLEAUX À MODIFIER » du fichier.</p>
          </li>
        </ol>
      </section>

      <section className="section">
        <details>
          <summary>Aperçu des {resultat.lignes.length} lignes exportées</summary>
          <div className="apercu" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Bloc</th><th>Référence</th><th>Désignation</th><th>Qté</th><th>M.O. unit.</th><th>Prix</th></tr></thead>
              <tbody>
                {resultat.lignes.map((l, i) => (
                  <tr key={i} className={i > 0 && resultat.lignes[i - 1].bloc !== l.bloc ? 'debut-bloc' : ''}>
                    <td>{l.bloc}</td><td>{l.ref ?? ''}</td><td className="des">{l.designation}</td>
                    <td className="num">{l.quantite}</td><td className="num">{l.moUnit ?? ''}</td><td className="num">{l.pu ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </>
  );
}
