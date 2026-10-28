import type { Devis, Resultat } from '../../../shared/types';
import { ORDRE_DOMOTIQUE } from '../../../shared/lots/cfo/catalogue';
import { useApp } from '../../lib/app';
import { ChampNombre, Compteur } from '../../lib/ui';
import type { Modifier } from '../Editeur';

const euros = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export function PanneauDomotique({ devis, resultat, modifier }: { devis: Devis; resultat: Resultat; modifier: Modifier }) {
  const { params } = useApp();
  const dom = devis.data.domotique;
  if (devis.data.mode !== 'KNX') return <p className="discret">Le devis est en commande classique : pas de bloc Domotique.</p>;
  const r = resultat.domotique;
  const pv = (cle: string, q: number, heures?: number) => {
    const p = params.domotique[cle];
    return q * (Math.round(p.pu * p.coefMat * 100) / 100 + Math.round((heures ?? p.heures) * params.tauxMo * p.coefMo * 100) / 100);
  };
  const lignes = r ? ORDRE_DOMOTIQUE.filter((k) => r.modules[k]).map((k) => ({ k, q: r.modules[k] })) : [];
  const total = lignes.reduce((a, l) => a + pv(l.k, l.q), 0) + (r ? pv('COUPURE', dom.coupure) + pv('ETS', 1, dom.heuresEts ?? 0) : 0);

  return (
    <>
      <div className="titre-piece"><h1>Domotique</h1></div>
      <section className="section">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={dom.actif} onChange={(e) => modifier((d) => { d.data.domotique.actif = e.target.checked; })} />
          Calculer le bloc Domotique à partir des pièces
        </label>
        <p className="petit discret" style={{ marginTop: 6 }}>Décoché, aucun bloc Domotique n’est exporté : tu le saisis directement dans Esabora.</p>
      </section>
      {dom.actif && r && (
        <>
          <section className="section">
            <div className="formulaire-ligne">
              <div className="champ" style={{ flex: '0 0 auto' }}>
                <label htmlFor="ets">Programmation ETS6 (heures)</label>
                <ChampNombre label="Heures de programmation ETS" valeur={dom.heuresEts} requis onChange={(n) => modifier((d) => { d.data.domotique.heuresEts = n; })} />
              </div>
              <div className="champ" style={{ flex: '0 0 auto' }}>
                <span className="lbl">Interrupteur de coupure extérieur</span>
                <Compteur label="Interrupteur de coupure" valeur={dom.coupure} onChange={(n) => modifier((d) => { d.data.domotique.coupure = n; })} />
              </div>
            </div>
          </section>
          <section className="section">
            <header><h2>Bloc exporté</h2><p>Prix et coefficients réglables dans Utilisateurs et prix.</p></header>
            <table className="liste bloc">
              <thead><tr><th>Désignation</th><th>Qté</th><th style={{ textAlign: 'right' }}>Total estimé</th></tr></thead>
              <tbody>
                {lignes.map((l) => <tr key={l.k}><td>{params.domotique[l.k].designation}</td><td className="num">{l.q}</td><td className="num" style={{ textAlign: 'right' }}>{euros(pv(l.k, l.q))}</td></tr>)}
                {dom.coupure > 0 && <tr><td>{params.domotique.COUPURE.designation}</td><td className="num">{dom.coupure}</td><td className="num" style={{ textAlign: 'right' }}>{euros(pv('COUPURE', dom.coupure))}</td></tr>}
                <tr><td>{params.domotique.ETS.designation} ({dom.heuresEts ?? '?'} h)</td><td className="num">1</td><td className="num" style={{ textAlign: 'right' }}>{euros(pv('ETS', 1, dom.heuresEts ?? 0))}</td></tr>
                <tr><td><b>Total du bloc</b></td><td /><td className="num" style={{ textAlign: 'right' }}><b>{euros(total)}</b></td></tr>
              </tbody>
            </table>
            <p className="petit discret" style={{ marginTop: 6 }}>Estimation avec les prix de l’outil. Esabora recalcule avec les mêmes valeurs à l’import.</p>
          </section>
          <section className="section">
            <header><h2>Modules par tableau</h2><p>Les modules sont placés dans le tableau qui alimente leurs circuits.</p></header>
            <table className="liste bloc">
              <thead><tr><th>Tableau</th><th>On/off</th><th>1-10 V</th><th>230 V</th><th>DALI</th><th>Stores, volets</th><th>Modules</th></tr></thead>
              <tbody>
                {resultat.tableaux.map((t) => (
                  <tr key={t.id}>
                    <td>{t.nom}</td>
                    {['onoff', 'SM4', 'DM4T', 'DALI', 'JM4T'].map((k) => <td key={k} className="num">{t.canaux[k] ?? 0}</td>)}
                    <td>{Object.entries(t.modules).filter(([, n]) => n).map(([k, n]) => `${n} × ${k}`).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details style={{ marginTop: 12 }}>
              <summary className="petit">Détail des inters ({r.parInter.length})</summary>
              <table className="liste" style={{ marginTop: 6 }}>
                <tbody>{r.parInter.map((i, n) => <tr key={n}><td>{i.piece}</td><td>Inter {i.inter}</td><td className="num">{i.boutons} bouton{i.boutons > 1 ? 's' : ''}</td><td>{i.modules}</td></tr>)}</tbody>
              </table>
            </details>
            <p className="petit discret" style={{ marginTop: 8 }}>Alimentation 640 mA : une pour 64 participants ({r.participants} ici), chacune ajoute un C10 au TGBT.</p>
          </section>
        </>
      )}
    </>
  );
}
