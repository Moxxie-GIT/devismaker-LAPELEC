// Icônes au trait (SVG en ligne, 24 × 24), dessinées pour l'outil : aucune dépendance, aucune requête.
import type { CSSProperties } from 'react';

const TRACES = {
  plus: 'M12 5v14M5 12h14',
  copie: 'M9 9h10v10H9zM5 15V5h10',
  corbeille: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  haut: 'M12 19V5M6 11l6-6 6 6',
  bas: 'M12 5v14M6 13l6 6 6-6',
  recherche: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  croix: 'M6 6l12 12M18 6L6 18',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  plan: 'M4 5h16v14H4zM4 10h16M4 15h16M9 5v14',
  agrandir: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  telecharger: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  coche: 'M5 12.5l4.5 4.5L19 7.5',
  alerte: 'M12 3l9.5 17h-19L12 3zM12 10v4.5M12 17.5v.01',
  dossier: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
  porte: 'M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M15 12v.01',
  puce: 'M7 7h10v10H7zM10 10h4v4h-4zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  liste: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  bouclier: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3zM9 12l2 2 4-4',
  utilisateurs: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  prix: 'M20.5 13.5l-7 7a2 2 0 0 1-2.8 0L3 12.8V3h9.8l7.7 7.7a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  cle: 'M15 9a3 3 0 1 0 0-.01M13 11l-9 9M7 17l2 2M9 15l2 2',
  sortie: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4',
  chevron: 'M6 9l6 6 6-6',
  eclair: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  ampoule: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  prise: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10v3M15 10v3M12 16v.01',
  interrupteur: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM10 8h4v8h-4z',
  tableau: 'M4 3h16v18H4zM4 9h16M4 15h16M8 6v.01M8 12v.01M8 18v.01',
  fichier: 'M14 3H6v18h12V7l-4-4zM14 3v4h4M9 13h6M9 17h6',
  rafraichir: 'M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4',
  nuage: 'M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-1 9H7z',
} as const;

export type NomIcone = keyof typeof TRACES;

export function Icone({ nom, taille = 16, className, style }: { nom: NomIcone; taille?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={`icone${className ? ` ${className}` : ''}`} style={style} width={taille} height={taille} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    >
      <path d={TRACES[nom]} />
    </svg>
  );
}
