// Panneau de droite : le tableau qui alimente la pièce, dessiné comme un coffret sur rail DIN.
import type { Devis, Piece, Resultat, TableauCalcule } from '../../../shared/types';
import { MODULES_PROTECTION, TABLEAUX } from '../../../shared/lots/cfo/catalogue';

const REPERE: Record<string, string> = { C10: 'C10', C16: 'C16', C20: 'C20', C32: 'C32', D32: 'C32\n300mA', D40: 'C40\n300mA', IDAC: 'ID\nAC', IDA: 'ID\nA' };
const PAR_RANGEE = 13;

interface Mod { rep: string; largeur: number; etat: '' | 'ajoute' | 'inutile' | 'fixe' | 'libre' }

function modules(t: TableauCalcule): Mod[] {
  const m = TABLEAUX[t.modele];
  const out: Mod[] = (m?.fixes ?? []).map((f) => ({ rep: f.label, largeur: f.modules, etat: 'fixe' }));
  const ordre = ['IDAC', 'IDA', 'D32', 'D40', 'C10', 'C16', 'C20', 'C32'];
  for (const k of ordre) {
    const p = t.protections.find((x) => x.cle === k);
    if (!p) continue;
    for (let i = 0; i < p.final; i++) {
      const etat = i >= p.base ? 'ajoute' : i >= p.besoin ? 'inutile' : '';
      out.push({ rep: REPERE[k] ?? k, largeur: MODULES_PROTECTION[k] ?? 1, etat });
    }
  }
  return out;
}

function rangees(mods: Mod[], capacite?: number): Mod[][] {
  const r: Mod[][] = [];
  let cur: Mod[] = []; let n = 0;
  for (const m of mods) {
    if (n + m.largeur > PAR_RANGEE) { r.push(cur); cur = []; n = 0; }
    cur.push(m); n += m.largeur;
  }
  if (cur.length) r.push(cur);
  if (capacite) {
    const nbR = Math.max(Math.ceil(capacite / PAR_RANGEE), r.length);
    while (r.length < nbR) r.push([]);
    for (const ligne of r) {
      let l = ligne.reduce((a, m) => a + m.largeur, 0);
      while (l < PAR_RANGEE) { ligne.push({ rep: '', largeur: 1, etat: 'libre' }); l++; }
    }
  }
  return r;
}

export function SchemaTableau({ t }: { t: TableauCalcule }) {
  const m = TABLEAUX[t.modele];
  const mods = modules(t);
  const utilises = mods.reduce((a, x) => a + x.largeur, 0);
  const cap = m?.capacite;
  const pct = cap ? Math.round((utilises / cap) * 100) : 0;
  return (
    <>
      <div className="coffret" role="img" aria-label={`Schéma de ${t.nom} : ${utilises} modules`}>
        {rangees(mods, cap).map((r, i) => (
          <div className="rangee" key={i}>
            {r.map((x, j) => (
              <div key={j} className={`module${x.largeur === 2 ? ' x2' : ''} ${x.etat}`} title={x.rep}>
                <span className="rep">{x.rep}</span><span className="manette" /><span />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="legende">
        <span><i />Inclus dans l’ensemble</span>
        <span><i className="ajoute" />À ajouter dans l’ensemble</span>
        <span><i className="inutile" />Facturé, non utilisé</span>
      </div>
      {cap ? (
        <div className="remplissage">
          {utilises} modules sur {cap} ({pct} %)
          <div className={`jauge${pct > 80 ? ' haut' : ''}`}><div style={{ width: `${Math.min(100, pct)}%` }} /></div>
          {pct > 80 && <p className="petit" style={{ marginTop: 4, color: 'var(--attention)' }}>Moins de 20 % de réserve : prévoir un coffret plus grand.</p>}
        </div>
      ) : null}
    </>
  );
}

export function Cote({ devis, resultat, piece, onSelection }: { devis: Devis; resultat: Resultat; piece?: Piece; onSelection: (s: string) => void }) {
  if (!piece) return <aside className="cote"><VueTableaux resultat={resultat} onSelection={onSelection} /></aside>;

  const choix = piece.tableau.choix;
  const t = choix === 'TD' ? resultat.tableaux.find((x) => x.id === piece.id)
    : choix === 'TGBT' ? resultat.tableaux.find((x) => x.id === 'TGBT')
      : choix === 'AUCUN' ? resultat.tableaux.find((x) => x.id === piece.tableau.alimentePar) ?? resultat.tableaux.find((x) => x.id === 'TGBT')
        : undefined;

  if (!choix) {
    return (
      <aside className="cote">
        <h2>Tableau</h2>
        <p className="sous">Indique s’il y a un TD dans la pièce : le calcul des disjoncteurs apparaîtra ici.</p>
      </aside>
    );
  }
  if (!t) {
    return (
      <aside className="cote">
        <h2>Tableau</h2>
        <p className="sous">Aucun TGBT dans le devis pour l’instant. Indique la pièce qui le porte (en général le local technique).</p>
      </aside>
    );
  }
  const porte = t.pieceId === piece.id;
  const aModifier = resultat.aModifier.find((a) => a.tableau === t.nom);
  const modsKnx = Object.entries(t.modules).filter(([, n]) => n);
  return (
    <aside className="cote" aria-label={`Tableau ${t.nom}`}>
      <h2>{t.nom}</h2>
      <p className="sous">
        {porte ? `Dans cette pièce, ensemble ${t.ensemble}.` : <>Cette pièce est alimentée par ce tableau, situé dans <button className="lien" onClick={() => onSelection(t.pieceId)}>{t.bloc}</button>.</>}
      </p>
      {!t.calculable ? (
        <div className="message attention">Tableau tétra : le calcul des disjoncteurs n’est pas géré. À faire directement dans Esabora.</div>
      ) : (
        <>
          <div className="chiffres">
            <div><b>{t.points}</b><span>points lumineux</span></div>
            <div><b>{t.socles}</b><span>socles de prises</span></div>
            <div><b>{t.circuits}</b><span>circuits</span></div>
          </div>
          <SchemaTableau t={t} />
          <div className="a-faire">
            <h3>Après l’import dans Esabora</h3>
            {aModifier ? (
              <table>
                <tbody>
                  {aModifier.changements.map((c) => (
                    <tr key={c.cle}><td>{c.label}<div className="discret">{c.ref}</div></td><td className="q">{c.base} → <b>{c.final}</b></td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="petit discret">Rien à changer : l’ensemble {t.ensemble} suffit tel quel.</p>}
          </div>
        </>
      )}
      {modsKnx.length > 0 && (
        <p className="rattachees">Modules KNX dans ce tableau : {modsKnx.map(([k, n]) => `${n} × ${k}`).join(', ')}.</p>
      )}
      {t.rattachees.length > 0 && (
        <div className="rattachees">Pièces alimentées par ce tableau :
          <ul>{t.rattachees.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
    </aside>
  );
}

function VueTableaux({ resultat, onSelection }: { resultat: Resultat; onSelection: (s: string) => void }) {
  return (
    <>
      <h2>Tableaux du devis</h2>
      <p className="sous">{resultat.tableaux.length ? 'Clique sur un tableau pour ouvrir la pièce qui le porte.' : 'Aucun tableau pour l’instant.'}</p>
      <table className="liste">
        <tbody>
          {resultat.tableaux.map((t) => {
            const m = resultat.aModifier.find((a) => a.tableau === t.nom);
            return (
              <tr key={t.id} className="cliquable" onClick={() => onSelection(t.pieceId)}>
                <td><b>{t.nom}</b><div className="petit discret">{t.ensemble}{t.calculable ? `, ${t.circuits} circuits` : ', tétra'}</div></td>
                <td className="petit" style={{ textAlign: 'right' }}>{m ? `${m.changements.length} ligne${m.changements.length > 1 ? 's' : ''} à modifier` : t.calculable ? 'Minimum suffisant' : 'À faire dans Esabora'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
