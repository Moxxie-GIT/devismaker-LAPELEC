// Panneau de droite : le tableau qui alimente la pièce, en 3D (coffret sur rails DIN) ou en schéma 2D.
import { Component, Suspense, lazy, useState, type ReactNode } from 'react';
import type { Devis, Piece, Resultat, TableauCalcule } from '../../../shared/types';
import { disposition, type Mod } from '../../lib/coffret';
import { TABLEAUX } from '../../../shared/lots/cfo/catalogue';
import { Icone } from '../../lib/icones';
import { Fenetre, Segments } from '../../lib/ui';

const Coffret3D = lazy(() => import('./Coffret3D'));

type Mode = '3d' | '2d';
const CLE_MODE = 'lapelec.vue-tableau';
function modeEnregistre(): Mode {
  try { return localStorage.getItem(CLE_MODE) === '2d' ? '2d' : '3d'; } catch { return '3d'; }
}

/** Si la 3D ne peut pas se charger (WebGL absent, fichier introuvable), on retombe sur le schéma 2D. */
class SecoursVue extends Component<{ secours: ReactNode; children: ReactNode }, { erreur: boolean }> {
  state = { erreur: false };
  static getDerivedStateFromError() { return { erreur: true }; }
  render() { return this.state.erreur ? this.props.secours : this.props.children; }
}

export function Vue3D({ t, grand }: { t: TableauCalcule; grand?: boolean }) {
  const [echec, setEchec] = useState(false);
  const secours = (
    <>
      <p className="petit discret" style={{ marginBottom: 8 }}>La vue 3D n’est pas disponible sur ce poste : schéma 2D affiché.</p>
      <SchemaTableau t={t} />
    </>
  );
  if (echec) return secours;
  return (
    <SecoursVue secours={secours}>
      <Suspense fallback={<div className={`coffret-3d chargement${grand ? ' grand' : ''}`}>Chargement de la vue 3D…</div>}>
        <Coffret3D t={t} grand={grand} onErreur={() => setEchec(true)} />
      </Suspense>
    </SecoursVue>
  );
}

export function SchemaTableau({ t }: { t: TableauCalcule }) {
  const { rangees, utilises, parRangee } = disposition(t);
  return (
    <div className={`coffret${parRangee > 18 ? ' serre' : ''}`} role="img" aria-label={`Schéma de ${t.nom} : ${utilises} modules`}>
      {rangees.map((r, i) => (
        <div className="rangee" key={i} style={{ gridTemplateColumns: `repeat(${parRangee}, minmax(0, 1fr))` }}>
          {r.map((x, j) => (
            <div
              key={j} className={`module${x.largeur > 1 ? ' x2' : ''} ${x.etat}${x.type ? ` ${x.type}` : ''}`}
              style={x.largeur > 1 ? { gridColumn: `span ${x.largeur}` } : undefined}
              title={[x.fonctions?.join(' · ') ?? (x.etat === 'inutile' ? 'Réserve' : ''), x.nom || x.rep].filter(Boolean).join('\n')}
            >
              <span className="rep">{x.rep}</span>{x.type !== 'bornier' && x.type !== 'repartiteur' && x.type !== 'transfo' && <span className="manette" />}<span />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Legende() {
  return (
    <div className="legende">
      <span><i />Inclus dans l’ensemble</span>
      <span><i className="ajoute" />À ajouter</span>
      <span><i className="inutile" />Facturé, non utilisé</span>
    </div>
  );
}

function Remplissage({ t }: { t: TableauCalcule }) {
  const { utilises, capacite, pct } = disposition(t);
  if (!capacite) return <p className="remplissage discret">{utilises} modules occupés</p>;
  return (
    <div className="remplissage">
      <div className="ligne-remplissage"><span>{utilises} modules sur {capacite}</span><b className="num">{pct} %</b></div>
      <div className={`jauge${pct > 80 ? ' haut' : ''}`}><div style={{ width: `${Math.min(100, pct)}%` }} /></div>
      {pct > 80 && <p className="petit" style={{ marginTop: 4, color: 'var(--attention)' }}>Moins de 20 % de réserve : prévoir un coffret plus grand.</p>}
    </div>
  );
}

function VueTableau({ t, onAgrandir }: { t: TableauCalcule; onAgrandir: () => void }) {
  const [mode, setModeLocal] = useState<Mode>(modeEnregistre);
  const setMode = (m: Mode) => { setModeLocal(m); try { localStorage.setItem(CLE_MODE, m); } catch { /* navigation privée */ } };
  return (
    <div className="vue-tableau">
      <div className="vue-outils">
        <Segments<Mode> petit label="Affichage du tableau" valeur={mode} options={[['3d', '3D'], ['2d', 'Schéma']]} onChange={setMode} />
        <button className="btn fantome petit" onClick={onAgrandir} title="Voir les tableaux du devis en grand"><Icone nom="agrandir" />Agrandir</button>
      </div>
      {mode === '3d' ? <Vue3D t={t} /> : <SchemaTableau t={t} />}
      {mode === '3d' && <p className="aide-3d">Glisser pour tourner, double-clic pour recentrer. Survole un appareil pour son détail.</p>}
      <Legende />
      <Remplissage t={t} />
    </div>
  );
}

/** Tableaux tétra : charge estimée de chaque phase après répartition (couleurs normalisées : brun, noir, gris). */
function Phases({ t }: { t: TableauCalcule }) {
  if (!t.phases) return null;
  const ph = t.phases;
  const max = Math.max(ph.L1, ph.L2, ph.L3, 0.1);
  const ecart = Math.max(ph.L1, ph.L2, ph.L3) - Math.min(ph.L1, ph.L2, ph.L3);
  return (
    <div className="phases">
      <h3>Répartition sur les phases</h3>
      {(['L1', 'L2', 'L3'] as const).map((p) => (
        <div className="phase" key={p}>
          <span className={`nom-phase ${p}`}>{p}</span>
          <div className="barre-phase"><div className={p} style={{ width: `${(ph[p] / max) * 100}%` }} /></div>
          <b className="num">{ph[p].toLocaleString('fr-FR')} kW</b>
        </div>
      ))}
      <p className="petit discret">
        Charges estimées (écart {ecart.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kW). Chaque départ porte sa phase sur son étiquette ;
        chaque interrupteur différentiel protège au plus 8 circuits d’une même phase.
      </p>
    </div>
  );
}

/** « C32\n300mA » → « C32 » */
const calibre = (m: Mod) => m.rep.split('\n')[0];

/** Les départs du tableau en clair : ce qui est écrit sur l'étiquette de chaque disjoncteur. */
/** La disposition du tableau en clair, rangée par rangée : chaque différentiel suivi de ses disjoncteurs et de leur étiquette. */
function ListeDeparts({ t, ouvert = true }: { t: TableauCalcule; ouvert?: boolean }) {
  const { rangees, rangeesUtiles } = disposition(t);
  const nbDeparts = rangees.flat().filter((m) => m.fonctions?.length && !m.cle.startsWith('ID')).length;
  if (!nbDeparts) return null;
  return (
    <details className="departs" open={ouvert}>
      <summary><h3>Disposition et étiquettes</h3><span className="compte">{rangeesUtiles} rangée{rangeesUtiles > 1 ? 's' : ''}</span></summary>
      {rangees.slice(0, rangeesUtiles).map((r, n) => (
        <div key={n} className="rangee-liste">
          <span className="titre-rangee">Rangée {n + 1}</span>
          <ul>
            {r.filter((m) => m.etat !== 'libre').map((m, i) => {
              const id = m.cle.startsWith('ID');
              const classe = id ? 'tete-id' : m.etat === 'fixe' ? 'fixe' : m.groupe ? 'sous-id' : '';
              return (
                <li key={i} className={`${classe}${m.etat === 'ajoute' ? ' ajoute' : ''}${m.etat === 'inutile' ? ' reserve' : ''}`}>
                  <span className="calibre">{id ? m.rep.replace('\n', ' ') : m.etat === 'fixe' ? m.rep : calibre(m)}</span>
                  <span className="fonctions">
                    {id ? <span><b>{m.fonctions?.[0]}</b> · {m.fonctions?.[1]}</span>
                      : m.fonctions?.length ? m.fonctions.map((f, k) => <span key={k}>{f}</span>)
                        : <span className="discret">{m.etat === 'inutile' ? 'Réserve' : m.nom}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="petit discret">Chaque interrupteur différentiel protège au plus 8 disjoncteurs, posés à sa suite sur le même rail.</p>
    </details>
  );
}

function AFaire({ t, resultat }: { t: TableauCalcule; resultat: Resultat }) {
  const aModifier = resultat.aModifier.find((a) => a.tableau === t.nom);
  return (
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
      ) : <p className="petit discret ok"><Icone nom="coche" />Rien à changer : l’ensemble {t.ensemble} suffit tel quel.</p>}
    </div>
  );
}

export function Cote({ devis, resultat, piece, onSelection }: { devis: Devis; resultat: Resultat; piece?: Piece; onSelection: (s: string) => void }) {
  const [grand, setGrand] = useState<string | null>(null);
  const fenetre = grand && <TableauxEnGrand resultat={resultat} initial={grand} onFermer={() => setGrand(null)} onSelection={(s) => { setGrand(null); onSelection(s); }} />;
  if (!piece) return <aside className="cote"><VueTableaux resultat={resultat} onSelection={onSelection} onAgrandir={setGrand} />{fenetre}</aside>;

  const choix = piece.tableau.choix;
  const t = choix === 'TD' ? resultat.tableaux.find((x) => x.id === piece.id)
    : choix === 'TGBT' ? resultat.tableaux.find((x) => x.id === 'TGBT')
      : choix === 'AUCUN' ? resultat.tableaux.find((x) => x.id === piece.tableau.alimentePar) ?? resultat.tableaux.find((x) => x.id === 'TGBT')
        : undefined;

  if (!choix || !t) {
    return (
      <aside className="cote">
        <span className="surtitre">Tableau</span>
        <h2>Pas encore de tableau</h2>
        <div className="cote-vide">
          <Icone nom="tableau" taille={28} />
          <p>{!choix
            ? 'Indique s’il y a un TD dans la pièce : le calcul des disjoncteurs apparaîtra ici.'
            : 'Aucun TGBT dans le devis pour l’instant. Indique la pièce qui le porte (en général le local technique).'}</p>
        </div>
      </aside>
    );
  }
  const porte = t.pieceId === piece.id;
  const modsKnx = Object.entries(t.modules).filter(([, n]) => n);
  return (
    <aside className="cote" aria-label={`Tableau ${t.nom}`}>
      <div className="cote-entete">
        <div>
          <span className="surtitre">{porte ? 'Tableau de la pièce' : 'Alimentée par'}</span>
          <h2>{t.nom}</h2>
        </div>
        <span className="pastille code">{t.ensemble}</span>
      </div>
      <p className="sous">
        {porte ? `Ensemble ${t.ensemble} dans cette pièce.` : <>Tableau situé dans <button className="lien" onClick={() => onSelection(t.pieceId)}>{t.bloc}</button>.</>}
      </p>
      {!t.calculable ? (
        <>
          <div className="message attention" style={{ marginBottom: 12 }}>
            Tableau tétra : les disjoncteurs ne sont pas recalculés, à adapter dans Esabora. Ci-dessous, le contenu de l’ensemble tel qu’il est facturé.
          </div>
          {disposition(t).mods.length > 0 && <VueTableau t={t} onAgrandir={() => setGrand(t.id)} />}
          <ContenuEnsemble t={t} resultat={resultat} />
        </>
      ) : (
        <>
          <div className="chiffres">
            <div><b>{t.points}</b><span>points lumineux</span></div>
            <div><b>{t.socles}</b><span>socles de prises</span></div>
            <div><b>{t.circuits}</b><span>circuits</span></div>
          </div>
          <VueTableau t={t} onAgrandir={() => setGrand(t.id)} />
          <Phases t={t} />
          <ListeDeparts t={t} />
          <AFaire t={t} resultat={resultat} />
          <ContenuEnsemble t={t} resultat={resultat} />
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
      {fenetre}
    </aside>
  );
}

/** Contenu de l'ensemble dans Esabora (coffret, appareils, accessoires), avec les quantités à changer après l'import. */
function ContenuEnsemble({ t, resultat, ouvert = false }: { t: TableauCalcule; resultat: Resultat; ouvert?: boolean }) {
  const modele = TABLEAUX[t.modele];
  if (!modele?.contenu?.length) return null;
  const changements = resultat.aModifier.find((a) => a.tableau === t.nom)?.changements ?? [];
  const parRef = new Map(changements.map((c) => [c.ref, c]));
  // protections à ajouter qui ne figurent pas du tout dans l'ensemble
  const enPlus = changements.filter((c) => !modele.contenu!.some((l) => l.ref === c.ref));
  return (
    <details className="departs contenu-ensemble" open={ouvert}>
      <summary><h3>Contenu de l’ensemble {modele.code}</h3><span className="compte">{modele.contenu.length}</span></summary>
      <ul>
        {modele.contenu.map((l, i) => {
          const c = l.ref ? parRef.get(l.ref) : undefined;
          return (
            <li key={i} className={c ? 'ajoute' : ''}>
              <span className="fonctions"><span>{l.nom}</span>{l.ref && <span className="petit discret">{l.ref}</span>}</span>
              <span className="qte num">{c ? <>{c.base} → <b>{c.final}</b></> : l.q}</span>
            </li>
          );
        })}
        {enPlus.map((c) => (
          <li key={c.cle} className="ajoute">
            <span className="fonctions"><span>{c.label}</span><span className="petit discret">{c.ref}, à ajouter</span></span>
            <span className="qte num">0 → <b>{c.final}</b></span>
          </li>
        ))}
      </ul>
      {modele.coffret && <p className="petit discret">Coffret de {modele.coffret.rangees} rangées de {modele.coffret.parRangee} modules.</p>}
    </details>
  );
}

function VueTableaux({ resultat, onSelection, onAgrandir }: { resultat: Resultat; onSelection: (s: string) => void; onAgrandir: (id: string) => void }) {
  const calculables = resultat.tableaux.filter((t) => disposition(t).mods.length > 0);
  return (
    <>
      <span className="surtitre">Vue d’ensemble</span>
      <h2>Tableaux du devis</h2>
      <p className="sous">{resultat.tableaux.length ? 'Clique sur un tableau pour ouvrir la pièce qui le porte.' : 'Aucun tableau pour l’instant.'}</p>
      {resultat.tableaux.length > 0 && (
        <div className="cartes-tableaux">
          {resultat.tableaux.map((t) => {
            const m = resultat.aModifier.find((a) => a.tableau === t.nom);
            return (
              <button key={t.id} className="carte-tableau" onClick={() => onSelection(t.pieceId)}>
                <Icone nom="tableau" taille={18} />
                <span className="txt">
                  <b>{t.nom}</b>
                  <span className="petit discret">{t.ensemble}{t.calculable ? `, ${t.circuits} circuits` : ', tétra'}</span>
                </span>
                <span className={`etat-tableau${m ? ' a-modifier' : ''}`}>
                  {m ? `${m.changements.length} à modifier` : t.calculable ? 'Suffisant' : 'Esabora'}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {calculables.length > 0 && (
        <button className="btn bloc-3d" onClick={() => onAgrandir(calculables[0].id)}><Icone nom="cube" />Voir les tableaux en 3D</button>
      )}
    </>
  );
}

/** Fenêtre large : tous les tableaux du devis en 3D, avec leurs étiquettes, leurs changements et le contenu de l'ensemble. */
function TableauxEnGrand({ resultat, initial, onFermer, onSelection }: { resultat: Resultat; initial: string; onFermer: () => void; onSelection: (s: string) => void }) {
  const liste = resultat.tableaux.filter((t) => disposition(t).mods.length > 0);
  const [id, setId] = useState(initial);
  const t = liste.find((x) => x.id === id) ?? liste[0];
  if (!t) return null;
  return (
    <Fenetre titre="Tableaux du devis" onFermer={onFermer} large>
      <div className="grand-3d">
        <nav className="grand-liste" aria-label="Tableaux">
          {liste.map((x) => {
            const m = resultat.aModifier.find((a) => a.tableau === x.nom);
            return (
              <button key={x.id} className="item" aria-current={x.id === t.id} onClick={() => setId(x.id)}>
                <span className="nom">{x.nom}</span>
                {m && <span className="compte">{m.changements.length}</span>}
              </button>
            );
          })}
        </nav>
        <div className="grand-vue">
          <Vue3D key={t.id} t={t} grand />
          <p className="aide-3d">Glisser pour tourner, clic droit pour déplacer, molette pour zoomer, double-clic pour recentrer.</p>
        </div>
        <div className="grand-infos">
          <span className="surtitre">{t.bloc}</span>
          <h3>{t.nom} <span className="pastille code">{t.ensemble}</span></h3>
          {t.calculable ? (
            <div className="chiffres">
              <div><b>{t.points}</b><span>points</span></div>
              <div><b>{t.socles}</b><span>socles</span></div>
              <div><b>{t.circuits}</b><span>circuits</span></div>
            </div>
          ) : <div className="message attention petit">Tétra : contenu de l’ensemble, disjoncteurs à adapter dans Esabora.</div>}
          <Legende />
          <Remplissage t={t} />
          <Phases t={t} />
          <ListeDeparts t={t} />
          {t.calculable && <AFaire t={t} resultat={resultat} />}
          <ContenuEnsemble t={t} resultat={resultat} />
          <button className="btn petit" style={{ marginTop: 14 }} onClick={() => onSelection(t.pieceId)}>Ouvrir la pièce {t.bloc}</button>
        </div>
      </div>
    </Fenetre>
  );
}
