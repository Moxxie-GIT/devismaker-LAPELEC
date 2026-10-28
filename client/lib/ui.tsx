// Petits composants d'interface réutilisables.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Compteur({ valeur, onChange, min = 0, max = 9999, pas = 1, label }: {
  valeur: number; onChange: (n: number) => void; min?: number; max?: number; pas?: number; label?: string;
}) {
  const [texte, setTexte] = useState(String(valeur));
  useEffect(() => { setTexte(String(valeur)); }, [valeur]);
  const borne = (n: number) => Math.min(max, Math.max(min, n));
  const valider = () => {
    const n = Number(texte.replace(',', '.'));
    if (Number.isFinite(n)) onChange(borne(n)); else setTexte(String(valeur));
  };
  return (
    <span className={`compteur${valeur === 0 ? ' zero' : ''}`}>
      <button type="button" aria-label={`Diminuer${label ? ` ${label}` : ''}`} onClick={() => onChange(borne(valeur - pas))}>−</button>
      <input
        inputMode="decimal" aria-label={label} value={texte}
        onChange={(e) => setTexte(e.target.value)} onBlur={valider}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" aria-label={`Augmenter${label ? ` ${label}` : ''}`} onClick={() => onChange(borne(valeur + pas))}>+</button>
    </span>
  );
}

/** Champ numérique libre (prix, heures) qui accepte le vide. */
export function ChampNombre({ valeur, onChange, placeholder, requis, largeur = 90, label }: {
  valeur: number | null; onChange: (n: number | null) => void; placeholder?: string; requis?: boolean; largeur?: number; label?: string;
}) {
  const [texte, setTexte] = useState(valeur == null ? '' : String(valeur));
  useEffect(() => { setTexte(valeur == null ? '' : String(valeur)); }, [valeur]);
  return (
    <input
      inputMode="decimal" aria-label={label} placeholder={placeholder} style={{ width: largeur }}
      className={`num${requis && valeur == null ? ' vide-requis' : ''}`}
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => {
        const t = texte.trim().replace(',', '.');
        if (t === '') { onChange(null); return; }
        const n = Number(t);
        if (Number.isFinite(n) && n >= 0) onChange(n); else setTexte(valeur == null ? '' : String(valeur));
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export function Segments<T extends string | number>({ valeur, options, onChange, petit, label }: {
  valeur: T | null; options: [T, string][]; onChange: (v: T) => void; petit?: boolean; label?: string;
}) {
  return (
    <span className={`segments${petit ? ' petit' : ''}`} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" aria-pressed={valeur === v} onClick={() => onChange(v)}>{l}</button>
      ))}
    </span>
  );
}

export function Fenetre({ titre, children, onFermer }: { titre: string; children: ReactNode; onFermer: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', k);
    ref.current?.querySelector<HTMLElement>('input, button, select, textarea')?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [onFermer]);
  return (
    <div className="voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="fenetre" role="dialog" aria-modal="true" aria-label={titre} ref={ref}>
        <h2>{titre}</h2>
        {children}
      </div>
    </div>
  );
}

export function Confirmer({ titre, texte, action, danger, onOui, onNon }: {
  titre: string; texte: ReactNode; action: string; danger?: boolean; onOui: () => void; onNon: () => void;
}) {
  return (
    <Fenetre titre={titre} onFermer={onNon}>
      <p className="discret">{texte}</p>
      <div className="boutons">
        <button className="btn" onClick={onNon}>Annuler</button>
        <button className={`btn ${danger ? 'danger' : 'primaire'}`} onClick={onOui}>{action}</button>
      </div>
    </Fenetre>
  );
}

let afficherToast: ((t: string) => void) | null = null;
export function toast(t: string) { afficherToast?.(t); }
export function ZoneToast() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    let h: any;
    afficherToast = (x) => { setT(x); clearTimeout(h); h = setTimeout(() => setT(null), 2600); };
    return () => { afficherToast = null; };
  }, []);
  return t ? <div className="toast" role="status">{t}</div> : null;
}

export function dateCourte(iso: string): string {
  const d = new Date(iso);
  const auj = new Date();
  const memeJour = d.toDateString() === auj.toDateString();
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (memeJour) return `aujourd’hui à ${heure}`;
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === auj.getFullYear() ? undefined : 'numeric' })} à ${heure}`;
}
