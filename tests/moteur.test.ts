import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculer, modulesOnOff, modulesPourInter, nomCourt } from '../shared/lots/cfo/moteur';
import { parametresParDefaut } from '../shared/lots';
import { nouvellePiece } from '../shared/lots/cfo/pieces';
import { villaDemo } from './fixtures';
import { paramsTest } from './params-test';

const params = paramsTest();

test('TA : jamais de TA6/TA8', () => {
  const s = (n: number) => { const m = modulesPourInter(n); return `${m.TA4}/${m.TA2}`; };
  assert.equal(s(1), '0/1'); assert.equal(s(2), '0/1'); assert.equal(s(3), '1/0'); assert.equal(s(4), '1/0');
  assert.equal(s(5), '1/1'); assert.equal(s(6), '1/1'); assert.equal(s(7), '2/0'); assert.equal(s(8), '2/0');
  assert.equal(s(10), '2/1');
});

test('modules on/off', () => {
  assert.deepEqual(modulesOnOff(0), {}); assert.deepEqual(modulesOnOff(3), { RM4: 1 });
  assert.deepEqual(modulesOnOff(6), { RM8: 1 }); assert.deepEqual(modulesOnOff(10), { RM8: 1, RM4: 1 });
  assert.deepEqual(modulesOnOff(13), { RM16: 1 }); assert.deepEqual(modulesOnOff(20), { RM16: 1, RM4: 1 });
});

test('villa démo : mêmes lignes que le fichier validé dans Esabora (prix fictifs)', () => {
  const r = calculer(villaDemo(), params);
  assert.deepEqual(r.alertes, []);
  const attendu = JSON.parse(readFileSync(new URL('./attendu_villa_demo.json', import.meta.url), 'utf8')) as any[];
  const norm = (v: any) => (v === null || v === undefined || Number.isNaN(v) ? null : v);
  const obtenu = r.lignes.map((l) => [l.bloc, norm(l.ref), l.designation, l.quantite, norm(l.pu), norm(l.coefMat), norm(l.coefMo), norm(l.moUnit), norm(l.tauxMo), norm(l.unite)]);
  assert.equal(obtenu.length, attendu.length);
  obtenu.forEach((l, i) => assert.deepEqual(l, attendu[i], `ligne ${i + 2}`));
});

test('noms courts pour les étiquettes du tableau', () => {
  assert.equal(nomCourt('Alimentation plaque de cuisson'), 'Plaque de cuisson');
  assert.equal(nomCourt('Prise 2P+T 220V directe (frigo)'), 'Prise frigo');
  assert.equal(nomCourt('Prise 2P+T 220V directe'), 'Prise directe');
  assert.equal(nomCourt('Alimentation Machine à laver 2P+T 220v'), 'Machine à laver');
  assert.equal(nomCourt('Alimentation jacuzzi 3g6mm² 220V'), 'Jacuzzi');
  assert.equal(nomCourt('Alimentation VMC'), 'VMC');
});

test('villa démo : une étiquette par disjoncteur nécessaire', () => {
  const r = calculer(villaDemo(), params);
  for (const t of r.tableaux.filter((x) => x.calculable)) {
    for (const p of t.protections) {
      if (p.cle.startsWith('ID')) continue;         // les différentiels n'ont pas de départ propre
      assert.equal(t.departs[p.cle]?.length ?? 0, p.besoin, `${t.nom} ${p.cle}`);
      for (const f of t.departs[p.cle] ?? []) assert.ok(f.length > 0 && f.every((x) => x.trim()), `${t.nom} ${p.cle} : étiquette vide`);
    }
  }
  const tgbt = r.tableaux.find((t) => t.id === 'TGBT')!;
  assert.ok(Object.values(tgbt.departs).flat(2).includes('Alimentation KNX'));
});

test('villa démo : étiquettes des disjoncteurs', () => {
  const r = calculer(villaDemo(), params);
  const t = (nom: string) => r.tableaux.find((x) => x.nom === nom)!.departs;
  // un C10 d'éclairage partagé cite toutes les pièces qu'il dessert
  assert.deepEqual(t('TGBT').C10[1], ['Éclairage WC invité, Terrasse']);
  // un C10 de volets, stores et portail cite chaque fonction
  assert.deepEqual(t('TGBT').C10[6], ['Volet roulant Salon', 'Ventilateur Salon', 'Store Terrasse', 'Portail Extérieur']);
  assert.deepEqual(t('TGBT').C10[8], ['Alimentation KNX']);
  assert.deepEqual(t('TD Cuisine').C32, [['Plaque de cuisson (Cuisine)']]);
  assert.deepEqual(t('TD Cuisine').C20[0], ['Prises Cuisine']);
  assert.deepEqual(t('TGBT').D32, [['Départ TD Chambre 1']]);
  assert.deepEqual(t('TGBT').D40, [['Départ TD Cuisine']]);
});

test('villa démo : tableaux à modifier', () => {
  const r = calculer(villaDemo(), params);
  const m = Object.fromEntries(r.aModifier.map((a) => [a.tableau, a.changements.map((c) => `${c.cle}:${c.base}>${c.final}`).join(' ')]));
  assert.deepEqual(m, {
    'TD Chambre 1': 'C10:1>5 C20:1>4',
    'TD Cuisine': 'C10:1>3 C20:1>6',
    TGBT: 'C10:7>9 C20:0>3 C32:0>2 D40:0>1',
  });
  assert.deepEqual(r.domotique?.modules, { RM8: 1, SM4: 3, JM4T: 2, RM4: 1, DM4T: 1, RM16: 1, DALI: 1, TA2: 8, TA4: 4, HORL: 1, USB: 1, IP: 1, ALIM: 1 });
});

test('contrôles : TD non renseigné, noms en double, pas de TGBT', () => {
  const d = villaDemo();
  d.pieces[1].nom = 'Chambre 1';
  d.pieces[5].tableau.choix = null;
  const r = calculer(d, params);
  const msg = r.alertes.filter((a) => a.niveau === 'erreur').map((a) => a.message).join(' | ');
  assert.match(msg, /Deux pièces s’appellent « Chambre 1 »/);
  assert.match(msg, /indique s’il y a un TD/);
  assert.match(msg, /Aucune pièce ne porte le TGBT/);
});

test('mode classique : interrupteurs, pas de domotique ni de variation', () => {
  const d = villaDemo();
  d.mode = 'CLASSIQUE';
  d.pieces[0].classique = { sa: 2, vv: 1, bps: 1 };
  const r = calculer(d, params);
  assert.equal(r.domotique, null);
  assert.ok(!r.lignes.some((l) => l.bloc === 'Domotique' || l.ref === 'ENSEBP' || l.ref === 'ENSELB'));
  assert.ok(!r.lignes.some((l) => l.designation.endsWith('variation')));
  assert.deepEqual(r.lignes.filter((l) => ['ENSESA', 'ENSEVV', 'ENSEBPS'].includes(l.ref ?? '')).map((l) => `${l.ref}:${l.quantite}`), ['ENSESA:2', 'ENSEVV:1', 'ENSEBPS:1']);
});

test('tétra : pas de calcul, avertissement', () => {
  const d = villaDemo();
  d.pieces[0].tableau.phase = 'tetra';
  const r = calculer(d, params);
  assert.ok(r.lignes.some((l) => l.bloc === 'Chambre 1' && l.ref === 'ENSETD3'));
  assert.ok(r.lignes.some((l) => l.bloc === 'Chambre 1' && l.ref === 'ENSEALIMTD1'));
  assert.ok(r.alertes.some((a) => /TD Chambre 1 est en tétra/.test(a.message)));
});

test('nouvelle pièce : questions par défaut', () => {
  const p = nouvellePiece('cuisine', 'Cuisine');
  assert.equal(p.tableau.choix, null);
  assert.equal(p.tableau.section, 10);
  assert.ok(p.elements.find((e) => e.cle === 'PLAQUE')?.quantite === 1);
  assert.equal(p.circuits[0].nom, 'Spot cuisine');
});

test('prix non réglés : avertissements', () => {
  const r = calculer(villaDemo(), parametresParDefaut());
  const msg = r.alertes.filter((a) => a.niveau === 'attention').map((a) => a.message).join(' | ');
  assert.match(msg, /Domotique : prix à 0 €/);
  assert.match(msg, /Taux de main d’œuvre à 0 €/);
  assert.equal(r.alertes.filter((a) => a.niveau === 'erreur').length, 0);
});

test('aucun prix dans les paramètres par défaut', () => {
  const p = parametresParDefaut();
  assert.equal(p.tauxMo, 0);
  for (const [k, v] of Object.entries(p.domotique)) assert.equal(v.pu, 0, k);
});

test('devis enregistré par une ancienne version : complété à la lecture', async () => {
  const { normaliserDevisData } = await import('../shared/lots');
  const ancien = { pieces: [{ id: 'p1', nom: 'Chambre 1', type: 'chambre', tableau: { choix: 'TD' }, circuits: [{ id: 'c1', nom: 'Spot', nb: 3 }] }] };
  const d = normaliserDevisData(ancien);
  assert.equal(d.mode, 'KNX');
  assert.equal(d.pieces[0].tableau.section, 6);
  assert.deepEqual(d.pieces[0].inters, []);
  assert.equal(d.pieces[0].circuits[0].commande, 'onoff');
  assert.deepEqual(d.divers, []);
  assert.equal(d.domotique.actif, true);
  // le résultat est accepté par le moteur
  const r = calculer(d, params);
  assert.ok(r.lignes.some((l) => l.ref === 'ENSETD1'));
});
