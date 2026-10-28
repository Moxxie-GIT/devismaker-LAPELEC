// Deux utilisateurs sur le même devis : présence, conflit d'enregistrement, page d'administration.
// Usage : node tests/e2e-multi.cjs <dossier-captures> <url> <login admin> <mdp admin> <login user> <mdp user>
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const [DOSSIER, URL, LA, MA, LU, MU] = process.argv.slice(2);

async function connecter(b, login, mdp) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(e.message));
  await p.goto(URL);
  await p.fill('#login', login); await p.fill('#mdp', mdp);
  await p.click('text=Se connecter');
  await p.waitForSelector('h1:has-text("Devis")');
  return { p, erreurs };
}

(async () => {
  const b = await chromium.launch();
  const A = await connecter(b, LA, MA);
  const U = await connecter(b, LU, MU);

  // l'admin crée un devis avec une pièce
  await A.p.click('text=Nouveau devis');
  await A.p.fill('#nd-t', 'Test conflit');
  await A.p.click('.fenetre >> text=Créer le devis');
  await A.p.waitForSelector('h1:has-text("Projet")');
  const url = A.p.url();

  // l'utilisateur ouvre le même devis : présence affichée des deux côtés
  await U.p.goto(url);
  await U.p.waitForSelector('h1:has-text("Projet")');
  await A.p.waitForSelector('text=Marc a aussi ce devis ouvert', { timeout: 30000 }).catch(() => {});
  await U.p.waitForSelector('text=a aussi ce devis ouvert');

  // modifications simultanées du titre
  await A.p.fill('#p-titre', 'Titre de l’admin');
  await A.p.waitForFunction(() => /Enregistré/.test(document.querySelector('.barre .etat')?.textContent || ''));
  await U.p.fill('#p-titre', 'Titre de Marc');
  await U.p.waitForSelector('text=pendant que tu le modifiais', { timeout: 8000 });
  await U.p.screenshot({ path: `${DOSSIER}/20-conflit.png` });
  await U.p.click('text=Recharger sa version');
  await U.p.waitForFunction(() => document.querySelector('#p-titre')?.value === 'Titre de l’admin', null, { timeout: 5000 });
  assert.equal(await U.p.isVisible('text=pendant que tu le modifiais'), false);

  // page d'administration
  await A.p.goto(`${URL}/parametres`);
  await A.p.waitForSelector('h1:has-text("Utilisateurs et prix")');
  await A.p.screenshot({ path: `${DOSSIER}/21-utilisateurs.png` });
  await A.p.click('text=Prix et coefficients');
  await A.p.waitForSelector('text=Bloc Domotique');
  await A.p.screenshot({ path: `${DOSSIER}/22-prix.png`, fullPage: true });

  // un utilisateur simple n'a pas accès aux paramètres
  await U.p.goto(`${URL}/parametres`);
  await U.p.waitForSelector('text=Page réservée aux administrateurs');

  assert.deepEqual([...A.erreurs, ...U.erreurs], []);
  console.log('multi-utilisateurs : ok');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
