// Éditeur d'un devis : navigation par pièce, enregistrement automatique, calcul en direct.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Devis, Piece } from '../../shared/types';
import { LOTS } from '../../shared/lots';
import { ORDRE_TYPES, TYPES_PIECES, dupliquerPiece, nouvellePiece } from '../../shared/lots/cfo/pieces';
import { ErreurApi, get, post, put } from '../lib/api';
import { Barre, useApp } from '../lib/app';
import { Confirmer, Fenetre, Segments, dateCourte, toast } from '../lib/ui';
import { PanneauPiece } from './editeur/Piece';
import { Cote } from './editeur/Cote';
import { PanneauDomotique } from './editeur/Domotique';
import { PanneauDivers } from './editeur/Divers';
import { PanneauExport } from './editeur/Export';

type Etat = 'ok' | 'modifie' | 'enregistrement' | 'erreur' | 'conflit';
export type Modifier = (fn: (d: Devis) => void) => void;

export function Editeur({ id }: { id: string }) {
  const { params, naviguer } = useApp();
  const [devis, setDevis] = useState<Devis | null>(null);
  const [erreurChargement, setErreurChargement] = useState('');
  const [selection, setSelection] = useState<string>('projet');
  const [etat, setEtat] = useState<Etat>('ok');
  const [messageEtat, setMessageEtat] = useState('');
  const [conflit, setConflit] = useState<{ modifiePar: string; modifieLe: string; version: number } | null>(null);
  const [presents, setPresents] = useState<string[]>([]);
  const [ajout, setAjout] = useState(false);

  const devisRef = useRef<Devis | null>(null);
  devisRef.current = devis;
  const versionRef = useRef(0);
  const sale = useRef(false);
  const enCours = useRef<Promise<void> | null>(null);
  const minuteur = useRef<any>(null);

  // ---- chargement
  useEffect(() => {
    get<Devis & { presents: string[] }>(`/api/devis/${id}`).then((d) => {
      versionRef.current = d.version;
      setDevis(d); setPresents(d.presents ?? []);
      if (d.data.pieces[0]) setSelection(d.data.pieces[0].id);
    }).catch((e) => setErreurChargement(e.message));
  }, [id]);

  // ---- présence des collègues
  useEffect(() => {
    const ping = () => post<{ presents: string[] }>(`/api/devis/${id}/presence`).then((r) => setPresents(r.presents)).catch(() => {});
    ping();
    const t = setInterval(ping, 20_000);
    return () => clearInterval(t);
  }, [id]);

  // ---- enregistrement
  const enregistrer = useCallback(async (force = false): Promise<void> => {
    if (enCours.current) { await enCours.current; if (!sale.current) return; }
    const d = devisRef.current;
    if (!d || (!sale.current && !force)) return;
    sale.current = false;
    setEtat('enregistrement');
    const p = (async () => {
      try {
        const r = await put<{ version: number; updatedAt: string; updatedBy: string }>(`/api/devis/${d.id}`, {
          titre: d.titre, client: d.client, reference: d.reference, data: d.data, version: versionRef.current,
        });
        versionRef.current = r.version;
        setEtat(sale.current ? 'modifie' : 'ok');
        setMessageEtat(`Enregistré ${dateCourte(r.updatedAt)}`);
      } catch (e) {
        sale.current = true;
        if (e instanceof ErreurApi && e.status === 409) { setEtat('conflit'); setConflit(e.details); }
        else { setEtat('erreur'); setMessageEtat(e instanceof Error ? e.message : 'Erreur'); }
      } finally {
        enCours.current = null;
      }
    })();
    enCours.current = p;
    await p;
  }, []);

  const planifier = useCallback(() => {
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => { if (etatRef.current !== 'conflit') enregistrer(); }, 1200);
  }, [enregistrer]);
  const etatRef = useRef<Etat>('ok');
  etatRef.current = etat;

  const modifier: Modifier = useCallback((fn) => {
    setDevis((prev) => {
      if (!prev) return prev;
      const d = structuredClone(prev);
      fn(d);
      return d;
    });
    sale.current = true;
    if (etatRef.current !== 'conflit') setEtat('modifie');
    planifier();
  }, [planifier]);

  // quitter la page : enregistrer d'abord
  useEffect(() => {
    const avant = (e: BeforeUnloadEvent) => {
      if (sale.current) { enregistrer(); e.preventDefault(); e.returnValue = ''; }
    };
    const nav = () => { if (sale.current) enregistrer(); };
    window.addEventListener('beforeunload', avant);
    window.addEventListener('avant-navigation', nav);
    return () => { window.removeEventListener('beforeunload', avant); window.removeEventListener('avant-navigation', nav); };
  }, [enregistrer]);

  // ---- calcul en direct
  const resultat = useMemo(() => (devis ? (LOTS[devis.lot] ?? LOTS.cfo).calculer(devis.data, params) : null), [devis?.data, params]);

  if (erreurChargement) {
    return (<><Barre /><main className="page"><div className="message erreur">{erreurChargement}</div><p style={{ marginTop: 12 }}><button className="btn" onClick={() => naviguer('/')}>Retour aux devis</button></p></main></>);
  }
  if (!devis || !resultat) return (<><Barre /><main className="page discret">Chargement du devis…</main></>);

  const data = devis.data;
  const piece = data.pieces.find((p) => p.id === selection);
  const alertesPiece = (pid: string) => resultat.alertes.filter((a) => a.pieceId === pid);
  const nbErreurs = resultat.alertes.filter((a) => a.niveau === 'erreur').length;

  const texteEtat = etat === 'enregistrement' ? 'Enregistrement…' : etat === 'modifie' ? 'Modifications en cours…'
    : etat === 'erreur' ? `Non enregistré : ${messageEtat}` : etat === 'conflit' ? 'Non enregistré : conflit' : messageEtat || `Modifié ${dateCourte(devis.updatedAt)} par ${devis.updatedBy}`;

  const recharger = async () => {
    const d = await get<Devis>(`/api/devis/${id}`);
    versionRef.current = d.version; sale.current = false;
    setDevis(d); setConflit(null); setEtat('ok'); setMessageEtat('');
    if (!d.data.pieces.find((p) => p.id === selection)) setSelection('projet');
  };
  const ecraser = async () => {
    if (!conflit) return;
    versionRef.current = conflit.version; setConflit(null); setEtat('modifie');
    await enregistrer(true);
    toast('Ta version a remplacé celle du serveur');
  };

  const ajouterPiece = (type: string, nom: string) => {
    const src = type.startsWith('__copie__') ? data.pieces.find((x) => x.id === type.slice(9)) : undefined;
    const p = src ? copierPiece(src, nom.trim() || `${src.nom} (copie)`) : nouvellePiece(type, nom);
    modifier((d) => {
      const i = d.data.pieces.findIndex((x) => x.id === selection);
      d.data.pieces.splice(i >= 0 ? i + 1 : d.data.pieces.length, 0, p);
    });
    setSelection(p.id);
    setAjout(false);
  };

  return (
    <>
      <Barre>
        <span className="fil"><span>Devis</span><b title={devis.titre}>{devis.titre}</b></span>
        <span className={`etat${etat === 'erreur' || etat === 'conflit' ? ' alerte' : ''}`} aria-live="polite">{texteEtat}</span>
        <button className="btn-barre" onClick={() => setSelection('export')}>
          {nbErreurs ? `Vérifier (${nbErreurs} à corriger)` : 'Vérifier et exporter'}
        </button>
      </Barre>

      <div className="editeur">
        <nav className="nav-pieces" aria-label="Pièces du devis">
          <button className="item" aria-current={selection === 'projet'} onClick={() => setSelection('projet')}>
            <span className="nom">Projet</span>
          </button>
          <div className="groupe">Pièces</div>
          {data.pieces.length === 0 && <p className="petit discret" style={{ padding: '0 8px' }}>Aucune pièce pour l’instant.</p>}
          {data.pieces.map((p) => {
            const al = alertesPiece(p.id);
            const niv = al.some((a) => a.niveau === 'erreur') ? 'erreur' : al.length ? 'attention' : '';
            return (
              <button key={p.id} className="item" aria-current={selection === p.id} onClick={() => setSelection(p.id)}>
                <span className="nom">{p.nom || 'Sans nom'}</span>
                {p.tableau.choix === 'TD' && <span className="tag">TD</span>}
                {p.tableau.choix === 'TGBT' && <span className="tag tgbt">TGBT</span>}
                {niv && <span className={`point ${niv}`} title={al.map((a) => a.message).join('\n')} />}
              </button>
            );
          })}
          <button className="btn petit ajout" onClick={() => setAjout(true)}>Ajouter une pièce</button>
          <div className="groupe">Fin du devis</div>
          {data.mode === 'KNX' && (
            <button className="item" aria-current={selection === 'domotique'} onClick={() => setSelection('domotique')}>
              <span className="nom">Domotique</span>{!data.domotique.actif && <span className="tag">non calculée</span>}
            </button>
          )}
          <button className="item" aria-current={selection === 'divers'} onClick={() => setSelection('divers')}><span className="nom">Divers</span></button>
          <button className="item" aria-current={selection === 'export'} onClick={() => setSelection('export')}>
            <span className="nom">Vérifier et exporter</span>{nbErreurs > 0 && <span className="point erreur" />}
          </button>
        </nav>

        <main className="zone">
          {presents.length > 0 && <div className="message info bandeau">{presents.join(', ')} {presents.length > 1 ? 'ont' : 'a'} aussi ce devis ouvert. Vos modifications peuvent se chevaucher.</div>}
          {conflit && (
            <div className="message erreur bandeau" role="alert">
              <p><b>{conflit.modifiePar}</b> a enregistré ce devis {dateCourte(conflit.modifieLe)}, pendant que tu le modifiais. Tes dernières modifications ne sont pas enregistrées.</p>
              <div className="pied-section">
                <button className="btn" onClick={recharger}>Recharger sa version</button>
                <button className="btn danger" onClick={ecraser}>Garder ma version</button>
              </div>
            </div>
          )}

          {selection === 'projet' && <PanneauProjet devis={devis} modifier={modifier} />}
          {piece && (
            <PanneauPiece
              key={piece.id} piece={piece} devis={devis} resultat={resultat} modifier={modifier}
              onSupprimee={() => setSelection('projet')} onSelection={setSelection}
            />
          )}
          {selection === 'domotique' && <PanneauDomotique devis={devis} resultat={resultat} modifier={modifier} />}
          {selection === 'divers' && <PanneauDivers devis={devis} modifier={modifier} />}
          {selection === 'export' && (
            <PanneauExport devis={devis} resultat={resultat} onAller={setSelection} avantExport={() => enregistrer()} etatSauvegarde={etat} />
          )}
          {!piece && !['projet', 'domotique', 'divers', 'export'].includes(selection) && <p className="discret">Pièce introuvable.</p>}
        </main>

        <Cote devis={devis} resultat={resultat} piece={piece} onSelection={setSelection} />
      </div>

      {ajout && <AjoutPiece pieces={data.pieces} onAjouter={ajouterPiece} onFermer={() => setAjout(false)} />}
    </>
  );
}

function PanneauProjet({ devis, modifier }: { devis: Devis; modifier: Modifier }) {
  const [changementMode, setChangementMode] = useState<null | 'KNX' | 'CLASSIQUE'>(null);
  return (
    <>
      <div className="titre-piece"><h1>Projet</h1></div>
      <section className="section">
        <div className="formulaire-ligne">
          <div className="champ" style={{ flex: '2 1 280px' }}>
            <label htmlFor="p-titre">Titre du devis</label>
            <input id="p-titre" value={devis.titre} onChange={(e) => modifier((d) => { d.titre = e.target.value; })} />
          </div>
          <div className="champ"><label htmlFor="p-client">Client</label><input id="p-client" value={devis.client} onChange={(e) => modifier((d) => { d.client = e.target.value; })} placeholder="Code client Esabora" /></div>
          <div className="champ"><label htmlFor="p-ref">N° de devis Esabora</label><input id="p-ref" value={devis.reference} onChange={(e) => modifier((d) => { d.reference = e.target.value; })} /></div>
        </div>
      </section>
      <section className="section">
        <header><h2>Commande de l’éclairage</h2></header>
        <Segments<'KNX' | 'CLASSIQUE'>
          label="Mode de commande" valeur={devis.data.mode}
          options={[['KNX', 'KNX (boutons poussoirs et domotique)'], ['CLASSIQUE', 'Classique (interrupteurs)']]}
          onChange={(m) => { if (m !== devis.data.mode) setChangementMode(m); }}
        />
        <p className="petit discret" style={{ marginTop: 8 }}>
          {devis.data.mode === 'KNX'
            ? 'Chaque pièce demande ses inters (avec leur nombre de boutons) et le type de commande de chaque circuit. Le bloc Domotique est calculé à partir de ces réponses.'
            : 'Chaque pièce demande ses interrupteurs simple allumage, va-et-vient et boutons poussoirs. Pas de bloc Domotique.'}
        </p>
      </section>
      <section className="section">
        <header><h2>Notes</h2><p>Pour l’équipe, non exportées.</p></header>
        <textarea style={{ width: '100%' }} value={devis.data.notes} onChange={(e) => modifier((d) => { d.data.notes = e.target.value; })} placeholder="Remarques sur le chantier, points à vérifier sur le plan…" />
      </section>
      {changementMode && (
        <Confirmer
          titre={changementMode === 'KNX' ? 'Passer en KNX ?' : 'Passer en commande classique ?'}
          texte={changementMode === 'KNX'
            ? 'Les interrupteurs saisis restent en mémoire mais ne seront plus exportés. Il faudra saisir les inters KNX de chaque pièce.'
            : 'Les inters KNX et le bloc Domotique restent en mémoire mais ne seront plus exportés. Il faudra saisir les interrupteurs de chaque pièce.'}
          action="Changer de mode"
          onNon={() => setChangementMode(null)}
          onOui={() => { const m = changementMode; modifier((d) => { d.data.mode = m; }); setChangementMode(null); }}
        />
      )}
    </>
  );
}

function prochainNom(label: string, pieces: Piece[]): string {
  const base = label.split(' / ')[0];
  const noms = new Set(pieces.map((p) => p.nom.trim().toLowerCase()));
  if (!noms.has(base.toLowerCase()) && !['Chambre'].includes(base)) return base;
  for (let i = 1; i < 200; i++) if (!noms.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
  return base;
}

function AjoutPiece({ pieces, onAjouter, onFermer }: { pieces: Piece[]; onAjouter: (type: string, nom: string) => void; onFermer: () => void }) {
  const [type, setType] = useState('chambre');
  const [nom, setNom] = useState(prochainNom(TYPES_PIECES.chambre.label, pieces));
  const [copieDe, setCopieDe] = useState('');
  return (
    <Fenetre titre="Ajouter une pièce" onFermer={onFermer}>
      <form onSubmit={(e) => {
        e.preventDefault();
        const src = pieces.find((p) => p.id === copieDe);
        if (src) { onAjouter('__copie__' + src.id, nom); return; }
        onAjouter(type, nom.trim() || TYPES_PIECES[type].label);
      }}>
        <div className="champ">
          <label htmlFor="ap-type">Type de pièce</label>
          <select id="ap-type" value={copieDe ? '' : type} disabled={!!copieDe} onChange={(e) => { setType(e.target.value); setNom(prochainNom(TYPES_PIECES[e.target.value].label, pieces)); }}>
            {ORDRE_TYPES.map((t) => <option key={t} value={t}>{TYPES_PIECES[t].label}</option>)}
          </select>
          <span className="aide">Le type pré-remplit les questions. Tout reste modifiable ensuite.</span>
        </div>
        {pieces.length > 0 && (
          <div className="champ">
            <label htmlFor="ap-copie">Ou copier une pièce existante</label>
            <select id="ap-copie" value={copieDe} onChange={(e) => {
              setCopieDe(e.target.value);
              const src = pieces.find((p) => p.id === e.target.value);
              setNom(src ? prochainNom(src.nom.replace(/\s*\d+$/, ''), pieces) : prochainNom(TYPES_PIECES[type].label, pieces));
            }}>
              <option value="">Non, partir du type</option>
              {pieces.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
        )}
        <div className="champ">
          <label htmlFor="ap-nom">Nom de la pièce</label>
          <input id="ap-nom" value={nom} onChange={(e) => setNom(e.target.value)} />
          <span className="aide">Ce nom devient le nom du bloc dans Esabora.</span>
        </div>
        <div className="boutons"><button type="button" className="btn" onClick={onFermer}>Annuler</button><button className="btn primaire">Ajouter la pièce</button></div>
      </form>
    </Fenetre>
  );
}

export function copierPiece(p: Piece, nom: string): Piece {
  const c = dupliquerPiece(p, nom);
  // une copie de la pièce du TGBT ne porte pas un second TGBT
  if (c.tableau.choix === 'TGBT') c.tableau.choix = null;
  return c;
}
