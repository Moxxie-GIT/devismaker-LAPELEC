// Parcours complet dans un navigateur (Playwright) : premier compte, devis, pièces, export.
// Usage : node tests/e2e.cjs <dossier-captures> [url]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');

const DOSSIER = process.argv[2] || 'captures';
const URL = process.argv[3] || 'http://localhost:8099';
mkdirSync(DOSSIER, { recursive: true });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  p.on('pageerror', (e) => erreurs.push('PAGEERROR ' + e.message));
  const cap = (nom, full = false) => p.screenshot({ path: `${DOSSIER}/${nom}.png`, fullPage: full });

  // premier lancement
  await p.goto(URL);
  await p.waitForSelector('text=Premier lancement');
  await cap('01-premier-lancement');
  await p.fill('#login', 'camille'); await p.fill('#nom', 'Camille Martin');
  await p.fill('#mdp', 'motdepasse123'); await p.fill('#mdp2', 'motdepasse123');
  await p.click('text=Créer le compte et entrer');
  await p.waitForSelector('text=Aucun devis pour l’instant');
  await cap('02-liste-vide');

  // nouveau devis
  await p.click('text=Nouveau devis');
  await p.fill('#nd-t', 'Devis CFO villa Les Hibiscus'); await p.fill('#nd-c', 'CLIENT01');
  await p.click('.fenetre >> text=Créer le devis');
  await p.waitForSelector('h1:has-text("Projet")');
  await cap('03-projet');

  // chambre avec TD
  await p.click('text=Ajouter une pièce');
  await cap('04-ajout-piece');
  await p.click('.fenetre >> text=Ajouter la pièce');
  await p.waitForSelector('input.nom-piece');
  assert.equal(await p.inputValue('input.nom-piece'), 'Chambre 1');
  await cap('05-chambre-a-repondre', true);
  await p.click('button:has-text("Oui, un TD")');
  // deux inters : 4 et 6 boutons
  await p.click('text=Ajouter un inter'); await p.click('text=Ajouter un inter');
  await p.locator('.inter').nth(0).locator('input').fill('4'); await p.locator('.inter').nth(0).locator('input').blur();
  await p.locator('.inter').nth(1).locator('input').fill('6'); await p.locator('.inter').nth(1).locator('input').blur();
  // renommer le premier circuit
  await p.locator('input[aria-label="Nom du circuit"]').first().fill('Spot S1');
  await p.waitForTimeout(300);
  await cap('06-chambre-td', true);
  const resume = await p.textContent('.resume-ta');
  assert.match(resume, /Bouton poussoir knx × 2/);
  assert.match(resume, /2 TA4 et 1 TA2/);

  // local technique avec TGBT
  await p.click('text=Ajouter une pièce');
  await p.selectOption('#ap-type', 'local_tech');
  await p.click('.fenetre >> text=Ajouter la pièce');
  await p.waitForFunction(() => document.querySelector('input.nom-piece')?.value === 'Local technique électrique');
  await p.click('button:has-text("C’est le TGBT")');
  await p.waitForTimeout(200);

  // salon sans TD, alimenté par le TGBT
  await p.click('text=Ajouter une pièce');
  await p.selectOption('#ap-type', 'salon');
  await p.click('.fenetre >> text=Ajouter la pièce');
  await p.waitForFunction(() => document.querySelector('input.nom-piece')?.value === 'Salon');
  await p.click('button:has-text("Non")');
  await p.waitForTimeout(300);
  await cap('07-salon-tgbt', true);

  // copie de la chambre
  await p.click('text=Ajouter une pièce');
  await p.selectOption('#ap-copie', { label: 'Chambre 1' });
  assert.equal(await p.inputValue('#ap-nom'), 'Chambre 2');
  await p.click('.fenetre >> text=Ajouter la pièce');
  await p.waitForFunction(() => document.querySelector('input.nom-piece')?.value === 'Chambre 2');

  // domotique
  await p.click('nav >> text=Domotique');
  await p.waitForSelector('h1:has-text("Domotique")');
  await p.locator('input[aria-label="Heures de programmation ETS"]').fill('20');
  await p.locator('input[aria-label="Heures de programmation ETS"]').blur();
  await p.waitForTimeout(200);
  await cap('08-domotique', true);

  // export : des erreurs (Divers à compléter)
  await p.click('nav >> text=Vérifier et exporter');
  await p.waitForSelector('h1:has-text("Vérifier et exporter")');
  await cap('09-export-erreurs', true);
  assert.ok(await p.isDisabled('text=Télécharger le fichier d’import'));

  // compléter Divers : garder Consuel, retirer le reste
  await p.click('nav >> text=Divers');
  const lignes = p.locator('table.grille tbody tr');
  while ((await lignes.count()) > 1) await lignes.nth(1).locator('button[aria-label="Retirer la ligne"]').click();
  await lignes.nth(0).locator('input[aria-label="Prix d’achat"]').fill('50');
  await lignes.nth(0).locator('input[aria-label="Coefficient matériel"]').fill('2');
  await lignes.nth(0).locator('input[aria-label="Heures"]').fill('1');
  await lignes.nth(0).locator('input[aria-label="Heures"]').blur();
  await p.waitForTimeout(200);
  await cap('10-divers', true);

  await p.click('nav >> text=Vérifier et exporter');
  await p.waitForSelector('text=Taux de main d’œuvre à 0 €');
  assert.ok(!(await p.isDisabled('text=Télécharger le fichier d’import')));
  // attendre l'enregistrement automatique
  await p.waitForFunction(() => /Enregistré/.test(document.querySelector('.barre .etat')?.textContent || ''), null, { timeout: 8000 });
  await cap('11-export-pret', true);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Télécharger le fichier d’import')]);
  const fichier = `${DOSSIER}/export.xlsx`;
  await dl.saveAs(fichier);
  console.log('fichier exporté :', dl.suggestedFilename());

  // rechargement : tout est enregistré
  await p.reload();
  await p.waitForSelector('nav >> text=Chambre 2');
  await p.click('nav >> text=Chambre 1');
  await p.waitForSelector('.cote h2:has-text("TD Chambre 1")');
  await cap('12-apres-rechargement', true);

  // vue mobile
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(200);
  await cap('13-mobile', true);

  console.log('erreurs console :', erreurs.length ? erreurs : 'aucune');
  assert.equal(erreurs.length, 0);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
