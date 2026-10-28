// Construit dist/ : serveur (un seul fichier, sans dépendance) + interface web.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// Dépendances : node_modules du projet, sinon celles installées sur la machine de build (NODE_PATH)
const chemins = [join(racine, 'node_modules'), ...(process.env.NODE_PATH ?? '').split(':').filter(Boolean), '/opt/npm-tools/node_modules'];
let esbuild;
for (const c of chemins) { try { esbuild = require(join(c, 'esbuild')); break; } catch {} }
if (!esbuild) { console.error('esbuild introuvable : lancer « npm install » d’abord.'); process.exit(1); }

const pkg = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8'));
const suffixe = process.env.BUILD_SHA ? process.env.BUILD_SHA.slice(0, 7) : new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const version = `${pkg.version}+${suffixe}`;
const dist = join(racine, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'public'), { recursive: true });

const commun = { bundle: true, nodePaths: chemins, logLevel: 'warning', legalComments: 'none' };

await esbuild.build({
  ...commun,
  entryPoints: [join(racine, 'server/index.ts')],
  outfile: join(dist, 'server.mjs'),
  platform: 'node', format: 'esm', target: 'node22',
  define: { __VERSION__: JSON.stringify(version) },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

await esbuild.build({
  ...commun,
  entryPoints: [join(racine, 'client/main.tsx')],
  outdir: join(dist, 'public'), entryNames: 'app',
  platform: 'browser', format: 'esm', target: ['chrome100', 'edge100', 'firefox100', 'safari15'],
  jsx: 'automatic', minify: true, sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"', __VERSION__: JSON.stringify(version) },
});

const h = (f) => createHash('sha1').update(readFileSync(join(dist, 'public', f))).digest('hex').slice(0, 10);
const html = readFileSync(join(racine, 'client/index.html'), 'utf8')
  .replace('%APP_JS%', `/app.js?v=${h('app.js')}`)
  .replace('%APP_CSS%', `/app.css?v=${h('app.css')}`);
writeFileSync(join(dist, 'public/index.html'), html);
if (existsSync(join(racine, 'client/favicon.svg'))) copyFileSync(join(racine, 'client/favicon.svg'), join(dist, 'public/favicon.svg'));
console.log(`dist/ construit (version ${version})`);
