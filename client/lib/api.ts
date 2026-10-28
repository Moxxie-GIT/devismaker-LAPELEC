// Appels à l'API du serveur.

export class ErreurApi extends Error {
  constructor(public status: number, message: string, public details?: any) { super(message); }
}

let surDeconnexion: (() => void) | null = null;
export function quandDeconnecte(fn: () => void) { surDeconnexion = fn; }

export async function api<T = any>(methode: string, chemin: string, corps?: unknown): Promise<T> {
  let rep: Response;
  try {
    rep = await fetch(chemin, {
      method: methode,
      headers: corps !== undefined || methode !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
      body: corps !== undefined ? JSON.stringify(corps) : methode !== 'GET' ? '{}' : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ErreurApi(0, 'Serveur injoignable. Vérifie la connexion au réseau de l’entreprise.');
  }
  if (rep.status === 204) return undefined as T;
  const texte = await rep.text();
  let json: any = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { /* réponse non JSON */ }
  if (!rep.ok) {
    if (rep.status === 401 && surDeconnexion && !chemin.startsWith('/api/connexion')) surDeconnexion();
    throw new ErreurApi(rep.status, json?.erreur ?? `Erreur ${rep.status}`, json?.details);
  }
  return json as T;
}

export const get = <T = any>(c: string) => api<T>('GET', c);
export const post = <T = any>(c: string, b?: unknown) => api<T>('POST', c, b ?? {});
export const put = <T = any>(c: string, b?: unknown) => api<T>('PUT', c, b ?? {});
export const del = <T = any>(c: string) => api<T>('DELETE', c, {});

/** Télécharge un fichier renvoyé par l'API (export xlsx). */
export async function telecharger(chemin: string) {
  const rep = await fetch(chemin, { credentials: 'same-origin' });
  if (!rep.ok) {
    let json: any = null;
    try { json = await rep.json(); } catch { /* */ }
    throw new ErreurApi(rep.status, json?.erreur ?? `Erreur ${rep.status}`, json?.details);
  }
  const dispo = rep.headers.get('Content-Disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(dispo);
  const nom = m ? decodeURIComponent(m[1]) : 'import.xlsx';
  const blob = await rep.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
