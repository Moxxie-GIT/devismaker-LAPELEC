// Mini routeur HTTP (node:http) : routes JSON, fichiers statiques, protections de base.
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

export class HttpError extends Error {
  constructor(public status: number, message: string, public data?: unknown) { super(message); }
}

export interface Req {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  headers: IncomingMessage['headers'];
  cookies: Record<string, string>;
  body: any;
  ip: string;
  securise: boolean;
  ctx: Record<string, any>;
}

export interface Reponse {
  status?: number;
  json?: unknown;
  body?: Buffer | string;
  headers?: Record<string, string | string[]>;
}

type Handler = (req: Req) => Promise<Reponse | void> | Reponse | void;
type Middleware = (req: Req) => Promise<void> | void;

interface Route { method: string; re: RegExp; keys: string[]; handlers: Handler[] }

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const SECURITE = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function lireCookies(h?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie illisible ignoré */ }
  }
  return out;
}

function lireCorps(req: IncomingMessage, max = 5 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const morceaux: Buffer[] = [];
    let taille = 0;
    req.on('data', (m: Buffer) => {
      taille += m.length;
      if (taille > max) { reject(new HttpError(413, 'Requête trop volumineuse.')); req.destroy(); return; }
      morceaux.push(m);
    });
    req.on('end', () => resolve(Buffer.concat(morceaux)));
    req.on('error', reject);
  });
}

export class Routeur {
  private routes: Route[] = [];
  private avant: Middleware[] = [];

  use(m: Middleware) { this.avant.push(m); }

  on(method: string, motif: string, ...handlers: Handler[]) {
    const keys: string[] = [];
    const re = new RegExp('^' + motif.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
  }
  get(m: string, ...h: Handler[]) { this.on('GET', m, ...h); }
  post(m: string, ...h: Handler[]) { this.on('POST', m, ...h); }
  put(m: string, ...h: Handler[]) { this.on('PUT', m, ...h); }
  delete(m: string, ...h: Handler[]) { this.on('DELETE', m, ...h); }

  serveur(dossierPublic: string) {
    const index = join(dossierPublic, 'index.html');
    return http.createServer(async (rq, rs) => {
      try {
        await this.traiter(rq, rs, dossierPublic, index);
      } catch (e) {
        const he = e instanceof HttpError ? e : null;
        if (!he) console.error('[erreur]', rq.method, rq.url, e);
        envoyer(rs, { status: he?.status ?? 500, json: { erreur: he?.message ?? 'Erreur interne du serveur.', ...(he?.data ? { details: he.data } : {}) } });
      }
    });
  }

  private async traiter(rq: IncomingMessage, rs: ServerResponse, dossierPublic: string, index: string) {
    const url = new URL(rq.url ?? '/', 'http://local');
    const method = (rq.method ?? 'GET').toUpperCase();
    const path = decodeURIComponent(url.pathname);

    if (!path.startsWith('/api/')) {
      if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'Méthode non autorisée.');
      return servirStatique(rs, dossierPublic, path, index);
    }

    const route = this.routes.find((r) => r.method === method && r.re.test(path));
    if (!route) throw new HttpError(404, 'Route inconnue.');

    // protection CSRF : requêtes d'écriture en JSON uniquement, et même origine
    if (method !== 'GET') {
      const ct = rq.headers['content-type'] ?? '';
      if (!ct.includes('application/json')) throw new HttpError(415, 'Requête JSON attendue.');
      const origin = rq.headers.origin;
      if (origin && new URL(origin).host !== rq.headers.host) throw new HttpError(403, 'Origine refusée.');
    }

    const m = route.re.exec(path)!;
    const params: Record<string, string> = {};
    route.keys.forEach((k, i) => { params[k] = m[i + 1]; });
    const brut = method === 'GET' ? Buffer.alloc(0) : await lireCorps(rq);
    let body: any = {};
    if (brut.length) {
      try { body = JSON.parse(brut.toString('utf8')); } catch { throw new HttpError(400, 'JSON invalide.'); }
    }
    const fwd = String(rq.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    const req: Req = {
      method, path, params, query: url.searchParams, headers: rq.headers, cookies: lireCookies(rq.headers.cookie), body,
      ip: fwd || rq.socket.remoteAddress || '', securise: rq.headers['x-forwarded-proto'] === 'https', ctx: {},
    };
    for (const a of this.avant) await a(req);
    for (const h of route.handlers) {
      const r = await h(req);
      if (r) return envoyer(rs, r);
    }
    envoyer(rs, { status: 204 });
  }
}

export function envoyer(rs: ServerResponse, r: Reponse) {
  const headers: Record<string, string | string[]> = { ...SECURITE, 'Cache-Control': 'no-store', ...(r.headers ?? {}) };
  if (r.json !== undefined) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    rs.writeHead(r.status ?? 200, headers);
    rs.end(JSON.stringify(r.json));
    return;
  }
  rs.writeHead(r.status ?? 200, headers);
  rs.end(r.body ?? '');
}

function servirStatique(rs: ServerResponse, dossier: string, path: string, index: string) {
  const cible = normalize(join(dossier, path));
  let fichier = index;
  if ((cible + sep).startsWith(dossier + sep) && existsSync(cible) && statSync(cible).isFile()) fichier = cible;
  if (!existsSync(fichier)) { envoyer(rs, { status: 404, body: 'Interface non construite (lancer npm run build).' }); return; }
  const type = MIME[extname(fichier)] ?? 'application/octet-stream';
  // l'index n'est jamais mis en cache ; les fichiers versionnés (?v=...) peuvent l'être
  const cache = fichier === index ? 'no-cache' : 'public, max-age=31536000, immutable';
  rs.writeHead(200, { ...SECURITE, 'Content-Type': type, 'Cache-Control': cache });
  createReadStream(fichier).pipe(rs);
}
