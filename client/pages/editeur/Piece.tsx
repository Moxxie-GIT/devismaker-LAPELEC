// Saisie d'une pièce : tableau, éclairage, commandes, équipements.
import { useState } from 'react';
import type { Circuit, Devis, Piece, Resultat } from '../../../shared/types';
import { CATALOGUE, LUMINAIRES } from '../../../shared/lots/cfo/catalogue';
import { ORDRE_TYPES, TYPES_PIECES, nomCircuitParDefaut, nouveauCircuit, nouvelElement } from '../../../shared/lots/cfo/pieces';
import { modulesPourInter } from '../../../shared/lots/cfo/moteur';
import { Compteur, Confirmer, Segments } from '../../lib/ui';
import type { Modifier } from '../Editeur';

const COMMANDES: [Circuit['commande'], string][] = [['onoff', 'On/off'], ['v110', 'Variation 1-10 V'], ['v230', 'Variation 230 V'], ['dali', 'DALI']];
const GROUPES = [...new Set(Object.values(CATALOGUE).map((c) => c.groupe))];

export function PanneauPiece({ piece, devis, resultat, modifier, onSupprimee, onSelection }: {
  piece: Piece; devis: Devis; resultat: Resultat; modifier: Modifier; onSupprimee: () => void; onSelection: (s: string) => void;
}) {
  const [suppression, setSuppression] = useState(false);
  const knx = devis.data.mode === 'KNX';
  const pieces = devis.data.pieces;
  const index = pieces.findIndex((p) => p.id === piece.id);
  const type = TYPES_PIECES[piece.type] ?? TYPES_PIECES.libre;
  const maj = (fn: (p: Piece) => void) => modifier((d) => { const p = d.data.pieces.find((x) => x.id === piece.id); if (p) fn(p); });
  const alertes = resultat.alertes.filter((a) => a.pieceId === piece.id);

  const deplacer = (sens: -1 | 1) => modifier((d) => {
    const i = d.data.pieces.findIndex((x) => x.id === piece.id);
    const j = i + sens;
    if (j < 0 || j >= d.data.pieces.length) return;
    [d.data.pieces[i], d.data.pieces[j]] = [d.data.pieces[j], d.data.pieces[i]];
  });

  return (
    <>
      <div className="titre-piece">
        <input
          className="nom-piece" aria-label="Nom de la pièce (nom du bloc Esabora)" value={piece.nom}
          onChange={(e) => maj((p) => { p.nom = e.target.value; })}
        />
        <div className="actions">
          <button className="btn fantome icone" title="Monter" aria-label="Monter la pièce" disabled={index === 0} onClick={() => deplacer(-1)}>↑</button>
          <button className="btn fantome icone" title="Descendre" aria-label="Descendre la pièce" disabled={index === pieces.length - 1} onClick={() => deplacer(1)}>↓</button>
          <button className="btn fantome petit danger" onClick={() => setSuppression(true)}>Supprimer</button>
        </div>
      </div>
      <div className="formulaire-ligne" style={{ marginBottom: 14 }}>
        <div className="champ" style={{ flex: '0 1 260px' }}>
          <label htmlFor="type-piece">Type de pièce</label>
          <select id="type-piece" value={piece.type} onChange={(e) => maj((p) => { p.type = e.target.value; })}>
            {ORDRE_TYPES.map((t) => <option key={t} value={t}>{TYPES_PIECES[t].label}</option>)}
          </select>
        </div>
      </div>
      {alertes.length > 0 && (
        <div className="alertes" style={{ marginBottom: 12 }}>
          {alertes.map((a, i) => <div key={i} className={`alerte ${a.niveau}`}><span className={`point ${a.niveau}`} />{a.message}</div>)}
        </div>
      )}

      <QuestionTableau piece={piece} pieces={pieces} maj={maj} conseil={type} />

      <section className="section">
        <header><h2>Éclairage</h2><p>Un circuit = des points identiques commandés ensemble. Les lignes à 0 ne sont pas exportées.</p></header>
        <Circuits piece={piece} knx={knx} maj={maj} />
      </section>

      <section className="section">
        <header>
          <h2>Commandes</h2>
          <p>{knx ? 'Un inter = une plaque. Le nombre de boutons sert au calcul des TA2 / TA4.' : 'Interrupteurs classiques.'}</p>
        </header>
        {knx ? <CommandesKnx piece={piece} maj={maj} /> : <CommandesClassiques piece={piece} maj={maj} />}
      </section>

      <section className="section">
        <header><h2>Prises et équipements</h2><p>Désignations modifiables, elles partent telles quelles dans Esabora.</p></header>
        <Equipements piece={piece} maj={maj} />
      </section>

      {suppression && (
        <Confirmer
          titre={`Supprimer « ${piece.nom} » ?`} danger action="Supprimer la pièce"
          texte={piece.tableau.choix === 'TD' && pieces.some((p) => p.tableau.choix === 'AUCUN' && p.tableau.alimentePar === piece.id)
            ? 'Cette pièce porte un TD qui alimente d’autres pièces : elles seront rattachées au TGBT.'
            : 'Toute la saisie de cette pièce sera perdue.'}
          onNon={() => setSuppression(false)}
          onOui={() => {
            modifier((d) => {
              d.data.pieces = d.data.pieces.filter((x) => x.id !== piece.id);
              for (const p of d.data.pieces) if (p.tableau.alimentePar === piece.id) p.tableau.alimentePar = 'TGBT';
            });
            const voisine = pieces[index + 1] ?? pieces[index - 1];
            if (voisine && voisine.id !== piece.id) onSelection(voisine.id); else onSupprimee();
          }}
        />
      )}
    </>
  );
}

function QuestionTableau({ piece, pieces, maj, conseil }: {
  piece: Piece; pieces: Piece[]; maj: (fn: (p: Piece) => void) => void; conseil: (typeof TYPES_PIECES)[string];
}) {
  const t = piece.tableau;
  const tds = pieces.filter((p) => p.id !== piece.id && p.tableau.choix === 'TD');
  const autreTgbt = pieces.find((p) => p.id !== piece.id && p.tableau.choix === 'TGBT');
  const conseilTexte = { TD: 'un TD dans la pièce', TGBT: 'le TGBT', AUCUN: 'pas de TD' }[conseil.conseilTableau];
  return (
    <div className={`question${t.choix ? '' : ' a-repondre'}`}>
      <div className="ligne">
        <div className="champ">
          <span className="lbl" id={`q-${piece.id}`}>Tableau électrique dans cette pièce ?</span>
          <Segments<'TD' | 'AUCUN' | 'TGBT'>
            label="Tableau électrique dans cette pièce" valeur={t.choix}
            options={[['TD', 'Oui, un TD'], ['AUCUN', 'Non'], ['TGBT', 'C’est le TGBT']]}
            onChange={(v) => maj((p) => { p.tableau.choix = v; })}
          />
        </div>
        {t.choix === 'TD' && (
          <>
            <div className="champ">
              <span className="lbl">Phase</span>
              <Segments<'mono' | 'tetra'> label="Phase du TD" valeur={t.phase} options={[['mono', 'Mono'], ['tetra', 'Tétra']]} onChange={(v) => maj((p) => { p.tableau.phase = v; })} />
            </div>
            <div className="champ">
              <label htmlFor={`sec-${piece.id}`}>Alimentation du TD</label>
              <select id={`sec-${piece.id}`} value={t.section} onChange={(e) => maj((p) => { p.tableau.section = Number(e.target.value) as 6 | 10; })}>
                <option value={6}>{t.phase === 'tetra' ? '5G6' : '3G6'} mm²</option>
                <option value={10}>{t.phase === 'tetra' ? '5G10' : '3G10'} mm²</option>
              </select>
            </div>
            <div className="champ">
              <label htmlFor={`mod-${piece.id}`}>Modèle</label>
              <select id={`mod-${piece.id}`} value={t.modele} onChange={(e) => maj((p) => { p.tableau.modele = e.target.value as 'standard' | 'plomberie'; })}>
                <option value="standard">TD standard (ENSETD1 / ENSETD3)</option>
                <option value="plomberie">TD local plomberie (ENSETDPLOMB)</option>
              </select>
            </div>
          </>
        )}
        {t.choix === 'AUCUN' && (
          <div className="champ">
            <label htmlFor={`alim-${piece.id}`}>Alimentée par</label>
            <select id={`alim-${piece.id}`} value={t.alimentePar} onChange={(e) => maj((p) => { p.tableau.alimentePar = e.target.value; })}>
              <option value="TGBT">TGBT</option>
              {tds.map((p) => <option key={p.id} value={p.id}>TD {p.nom}</option>)}
            </select>
          </div>
        )}
        {t.choix === 'TGBT' && (
          <div className="champ">
            <span className="lbl">Phase</span>
            <Segments<'mono' | 'tetra'> label="Phase du TGBT" valeur={t.phase} options={[['mono', 'Monophasé'], ['tetra', 'Tétra']]} onChange={(v) => maj((p) => { p.tableau.phase = v; })} />
          </div>
        )}
      </div>
      <p className="conseil">
        {!t.choix && <>À renseigner. Pour ce type de pièce, c’est souvent {conseilTexte}. </>}
        {conseil.aide}
        {t.choix === 'TGBT' && autreTgbt && <b> Attention : {autreTgbt.nom} porte déjà le TGBT.</b>}
      </p>
    </div>
  );
}

function Circuits({ piece, knx, maj }: { piece: Piece; knx: boolean; maj: (fn: (p: Piece) => void) => void }) {
  const majC = (id: string, fn: (c: Circuit) => void) => maj((p) => { const c = p.circuits.find((x) => x.id === id); if (c) fn(c); });
  return (
    <>
      {piece.circuits.length > 0 && (
        <div className="defile"><table className="grille">
          <thead><tr><th>Type</th><th>Nom dans la désignation</th><th>Lieu</th><th>Points</th>{knx && <th>Commande</th>}<th>Pose</th><th /></tr></thead>
          <tbody>
            {piece.circuits.map((c) => {
              const estLed = c.type === 'led';
              return (
                <tr key={c.id} className={c.nb > 0 ? '' : 'nul'}>
                  <td>
                    <select className="s-type" aria-label="Type de luminaire" value={c.type} onChange={(e) => majC(c.id, (x) => {
                      const ancien = nomCircuitParDefaut(x.type, piece.type);
                      const l = LUMINAIRES[e.target.value];
                      if (!x.nom.trim() || x.nom === ancien) x.nom = nomCircuitParDefaut(e.target.value, piece.type);
                      x.type = e.target.value;
                      x.lieu = l.lieu;
                      x.pose = l.pose;
                    })}>
                      {Object.entries(LUMINAIRES).map(([k, l]) => <option key={k} value={k}>{l.label}</option>)}
                    </select>
                  </td>
                  <td className="l"><input aria-label="Nom du circuit" value={c.nom} onChange={(e) => majC(c.id, (x) => { x.nom = e.target.value; })} placeholder="Ex. LED S1" /></td>
                  <td><Segments<'int' | 'ext'> petit label="Intérieur ou extérieur" valeur={c.lieu} options={[['int', 'Int.'], ['ext', 'Ext.']]} onChange={(v) => majC(c.id, (x) => { x.lieu = v; })} /></td>
                  <td><Compteur label="Nombre de points" valeur={c.nb} onChange={(n) => majC(c.id, (x) => { x.nb = n; })} /></td>
                  {knx && (
                    <td>
                      <select className="s-cmd" aria-label="Commande" value={c.commande} onChange={(e) => majC(c.id, (x) => { x.commande = e.target.value as Circuit['commande']; })}>
                        {COMMANDES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                  )}
                  <td>
                    <select className="s-pose" aria-label="Pose" title={estLed ? "Bandeau LED facile ou difficile à poser" : "Temps de pose"} value={c.pose} onChange={(e) => majC(c.id, (x) => { x.pose = e.target.value as Circuit['pose']; })}>
                      {estLed || c.pose.startsWith('led') ? (
                        <>
                          <option value="led_facile">Facile, 1 h</option>
                          <option value="led_difficile">Difficile, 2 h</option>
                        </>
                      ) : <option value="std">Pose 1 h</option>}
                      <option value="aucune">Sans pose</option>
                    </select>
                  </td>
                  <td><button className="btn fantome icone" aria-label="Retirer le circuit" title="Retirer" onClick={() => maj((p) => { p.circuits = p.circuits.filter((x) => x.id !== c.id); })}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
      <div className="pied-section">
        <button className="btn petit" onClick={() => maj((p) => { p.circuits.push(nouveauCircuit('spot', p.type, 1)); })}>Ajouter un circuit</button>
        <span className="petit discret">
          {piece.circuits.reduce((a, c) => a + c.nb, 0)} point(s) lumineux
        </span>
      </div>
    </>
  );
}

function CommandesKnx({ piece, maj }: { piece: Piece; maj: (fn: (p: Piece) => void) => void }) {
  const ta = piece.inters.reduce((a, n) => { const m = modulesPourInter(n); return { TA2: a.TA2 + m.TA2, TA4: a.TA4 + m.TA4 }; }, { TA2: 0, TA4: 0 });
  return (
    <>
      <div className="inters">
        {piece.inters.map((n, i) => (
          <span className="inter" key={i}>
            <span className="n">Inter {i + 1}</span>
            <Compteur label={`Boutons de l’inter ${i + 1}`} valeur={n} min={1} max={32} onChange={(v) => maj((p) => { p.inters[i] = v; })} />
            <span className="petit discret">bouton{n > 1 ? 's' : ''}</span>
            <button className="btn fantome icone" aria-label={`Retirer l’inter ${i + 1}`} onClick={() => maj((p) => { p.inters.splice(i, 1); })}>×</button>
          </span>
        ))}
        <button className="btn petit" onClick={() => maj((p) => { p.inters.push(2); })}>Ajouter un inter</button>
      </div>
      <div className="formulaire-ligne" style={{ marginTop: 12 }}>
        <div className="champ" style={{ flex: '0 0 auto' }}>
          <span className="lbl">Détecteurs KNX</span>
          <Compteur label="Détecteurs KNX" valeur={piece.detecteurs} onChange={(n) => maj((p) => { p.detecteurs = n; })} />
        </div>
      </div>
      <p className="resume-ta">
        {piece.inters.length
          ? <>Export : Bouton poussoir knx × {piece.inters.length}. Domotique : {[ta.TA4 && `${ta.TA4} TA4`, ta.TA2 && `${ta.TA2} TA2`].filter(Boolean).join(' et ')}.</>
          : 'Aucun inter dans cette pièce.'}
      </p>
    </>
  );
}

function CommandesClassiques({ piece, maj }: { piece: Piece; maj: (fn: (p: Piece) => void) => void }) {
  const ligne = (cle: 'sa' | 'vv' | 'bps', label: string) => (
    <div className="champ" style={{ flex: '0 0 auto' }}>
      <span className="lbl">{label}</span>
      <Compteur label={label} valeur={piece.classique[cle]} onChange={(n) => maj((p) => { p.classique[cle] = n; })} />
    </div>
  );
  return (
    <div className="formulaire-ligne">
      {ligne('sa', 'Simple allumage')}
      {ligne('vv', 'Va-et-vient')}
      {ligne('bps', 'Boutons poussoirs')}
    </div>
  );
}

function Equipements({ piece, maj }: { piece: Piece; maj: (fn: (p: Piece) => void) => void }) {
  const parGroupe = GROUPES.map((g) => [g, piece.elements.filter((e) => (CATALOGUE[e.cle]?.groupe ?? 'Autres') === g)] as const)
    .filter(([, l]) => l.length);
  return (
    <>
      {piece.elements.length > 0 && (
        <table className="grille">
          <tbody>
            {parGroupe.map(([g, liste]) => [
              <tr key={`g-${g}`} className="sous-groupe"><td colSpan={3}>{g}</td></tr>,
              ...liste.map((e) => (
                <tr key={e.id} className={e.quantite > 0 ? '' : 'nul'}>
                  <td className="l"><input aria-label="Désignation" value={e.designation} onChange={(ev) => maj((p) => { const x = p.elements.find((y) => y.id === e.id); if (x) x.designation = ev.target.value; })} /></td>
                  <td><Compteur label={e.designation} valeur={e.quantite} onChange={(n) => maj((p) => { const x = p.elements.find((y) => y.id === e.id); if (x) x.quantite = n; })} /></td>
                  <td><button className="btn fantome icone" aria-label="Retirer" title="Retirer" onClick={() => maj((p) => { p.elements = p.elements.filter((y) => y.id !== e.id); })}>×</button></td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      )}
      <div className="pied-section">
        <select aria-label="Ajouter un équipement" value="" onChange={(e) => { const cle = e.target.value; if (cle) maj((p) => { p.elements.push(nouvelElement(cle, 1)); }); }}>
          <option value="">Ajouter un équipement…</option>
          {GROUPES.map((g) => (
            <optgroup key={g} label={g}>
              {Object.entries(CATALOGUE).filter(([, c]) => c.groupe === g).map(([k, c]) => (
                <option key={k} value={k}>{c.designation.replace(/ Veuillez noter.*$/, '').slice(0, 80)}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </>
  );
}
