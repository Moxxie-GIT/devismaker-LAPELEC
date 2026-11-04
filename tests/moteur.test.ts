import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculer, modulesOnOff, modulesPourInter, nomCourt } from '../shared/lots/cfo/moteur';
import { parametresParDefaut } from '../shared/lots';
import { nouvelElement, nouvellePiece } from '../shared/lots/cfo/pieces';
import { CATALOGUE } from '../shared/lots/cfo/catalogue';
import { disposer } from '../shared/lots/cfo/disposition';
import { totauxParBloc } from '../shared/totaux';
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

test('liaison bus : sous chaque TD qui contient du KNX, et seulement ceux-là', () => {
  const d = villaDemo();
  const blocsLiaison = (r: ReturnType<typeof calculer>) => r.lignes.filter((l) => l.ref === 'ENSELB').map((l) => l.bloc);
  // les deux TD de la villa ont des circuits commandés en KNX : une liaison sous chacun, juste après l'ensemble
  const r = calculer(d, params);
  assert.deepEqual(blocsLiaison(r), ['Chambre 1', 'Cuisine']);
  for (const bloc of ['Chambre 1', 'Cuisine']) {
    const i = r.lignes.findIndex((l) => l.bloc === bloc && l.ref === 'ENSELB');
    assert.equal(r.lignes[i - 1].ref, 'ENSETD1');
  }
  // la chambre n'a plus ni éclairage ni volet/ventilateur : son TD ne contient pas de KNX
  const ch = d.pieces.find((p) => p.nom === 'Chambre 1')!;
  ch.circuits.forEach((c) => { c.nb = 0; });
  ch.elements = ch.elements.filter((e) => !CATALOGUE[e.cle]?.canal);
  assert.deepEqual(blocsLiaison(calculer(d, params)), ['Cuisine']);
});

test('coffret trop petit : avertissement', () => {
  const d = villaDemo();
  d.pieces.find((p) => p.nom === 'Chambre 1')!.elements.push(nouvelElement('CLIM', 30));
  const r = calculer(d, params);
  assert.ok(r.alertes.some((a) => a.niveau === 'attention' && /TD Chambre 1 : \d+ modules pour 39 places/.test(a.message)));
});

test('TD tétra : départs répartis sur les 3 phases, différentiels par phase', () => {
  const d = villaDemo();
  d.pieces.find((p) => p.nom === 'Cuisine')!.tableau.phase = 'tetra';
  const r = calculer(d, params);
  const t = r.tableaux.find((x) => x.nom === 'TD Cuisine')!;
  assert.equal(t.calculable, true);
  assert.equal(t.ensemble, 'ENSETD3');
  assert.ok(r.lignes.some((l) => l.bloc === 'Cuisine' && l.ref === 'ENSEALIMTD3'));
  assert.ok(!r.alertes.some((a) => /TD Cuisine est en tétra/.test(a.message)));
  // chaque départ 1P+N porte sa phase, et les trois phases servent
  const unPhase = ['C10', 'C16', 'C20', 'C32'].flatMap((k) => t.departs[k] ?? []);
  const phaseDe = (f: string[]) => /^(L[123]) · /.exec(f[0])?.[1];
  assert.ok(unPhase.every((f) => phaseDe(f)));
  assert.deepEqual(new Set(unPhase.map(phaseDe)), new Set(['L1', 'L2', 'L3']));
  // charges équilibrées : l'écart ne dépasse pas le plus gros départ (la plaque, 6 kW)
  const { L1, L2, L3 } = t.phases!;
  assert.ok(Math.max(L1, L2, L3) - Math.min(L1, L2, L3) <= 6, `phases ${L1} / ${L2} / ${L3}`);
  // au plus 8 circuits par interrupteur différentiel, sur sa phase ; la plaque est sous un ID type A de sa phase
  const ids = [...(t.departs.IDA ?? []), ...(t.departs.IDAC ?? [])].map((f) => f[0].slice(-2));
  for (const p of ['L1', 'L2', 'L3']) {
    const n = unPhase.filter((f) => phaseDe(f) === p).length;
    assert.ok(n <= 8 * ids.filter((x) => x === p).length, `${p} : ${n} circuits`);
  }
  const plaque = phaseDe(unPhase.find((f) => /Plaque de cuisson/.test(f[0]))!);
  assert.ok((t.departs.IDA ?? []).some((f) => f[0] === `Différentiel ${plaque}`));
});

test('TD tétra : un disjoncteur différentiel 4P 30 mA par appareil 400 V', () => {
  const d = villaDemo();
  const cuisine = d.pieces.find((p) => p.nom === 'Cuisine')!;
  cuisine.tableau.phase = 'tetra';
  cuisine.elements.push(nouvelElement('PPIS400', 2), nouvelElement('DRV400', 1));
  const r = calculer(d, params);
  const t = r.tableaux.find((x) => x.nom === 'TD Cuisine')!;
  const p = (k: string) => t.protections.find((x) => x.cle === k)!;
  // deux pompes sur les trois 4P C10 30 mA de l'ensemble : le troisième reste en réserve
  assert.deepEqual([p('DD4_C10_AC30').besoin, p('DD4_C10_AC30').final], [2, 3]);
  assert.deepEqual(t.departs.DD4_C10_AC30, [['Pompe piscine (Cuisine)'], ['Pompe piscine (Cuisine)']]);
  // le DRV demande un 4P C32 30 mA, dont la référence n'est pas connue : à choisir
  assert.equal(p('DD4_C32_AC30').besoin, 1);
  assert.ok(r.alertes.some((a) => /référence Legrand à choisir/.test(a.message)));
  assert.ok(!r.alertes.some((a) => /est en 400 V alors que/.test(a.message)));
});

test('disposition aux normes : 8 circuits au plus par ID, type A sous ID A, groupes jamais coupés', () => {
  for (const tetra of [false, true]) {
    const d = villaDemo();
    if (tetra) { d.pieces.find((p) => p.nom === 'Cuisine')!.tableau.phase = 'tetra'; d.pieces.find((p) => p.tableau.choix === 'TGBT')!.tableau.phase = 'tetra'; }
    const r = calculer(d, params);
    for (const t of r.tableaux.filter((x) => x.calculable)) {
      const groupes = t.groupes!;
      // chaque disjoncteur 1P+N facturé est placé une fois et une seule
      for (const p of t.protections.filter((x) => ['C10', 'C16', 'C20', 'C32'].includes(x.cle))) {
        const places = groupes.flatMap((g) => g.membres).filter((m) => m.cle === p.cle).map((m) => m.i).sort((a, b) => a - b);
        assert.deepEqual(places, Array.from({ length: p.final }, (_, i) => i), `${t.nom} ${p.cle}`);
      }
      const besoin = (k: string) => t.protections.find((x) => x.cle === k)?.besoin ?? 0;
      for (const g of groupes.filter((x) => x.tete)) {
        assert.ok(g.membres.length <= 8, `${t.nom} ${g.libelle} : ${g.membres.length}`);
        for (const m of g.membres.filter((x) => x.i < besoin(x.cle))) {
          const f = t.departs[m.cle][m.i].join(' ');
          if (/Plaque de cuisson|Machine à laver/.test(f)) assert.equal(g.tete!.cle, 'IDA', `${t.nom} : ${f}`);
          if (tetra && t.phases) assert.ok(g.libelle.endsWith(`(${f.slice(0, 2)})`), `${t.nom} : ${f} sous ${g.libelle}`);
        }
      }
      // une suite « ID + ses disjoncteurs » tient sur une seule rangée
      const dsp = disposer(t);
      for (const g of groupes.filter((x) => x.tete)) {
        const rangs = dsp.rangees.map((rg, i) => (rg.some((m) => m.groupe === g.libelle || (m.fonctions?.[0] === g.libelle)) ? i : -1)).filter((i) => i >= 0);
        assert.equal(rangs.length, 1, `${t.nom} ${g.libelle} sur ${rangs.length} rangées`);
      }
    }
  }
});

test('totaux par bloc : montants des blocs chiffrés, heures de pose des pièces', () => {
  const r = calculer(villaDemo(), params);
  const { blocs, general } = totauxParBloc(r.lignes);
  assert.deepEqual(blocs.map((b) => b.bloc), [...new Set(r.lignes.map((l) => l.bloc))]);
  const ch = blocs.find((b) => b.bloc === 'Chambre 1')!;
  assert.equal(ch.total, null);
  assert.equal(ch.heures, r.lignes.filter((l) => l.bloc === 'Chambre 1').reduce((a, l) => a + (l.moUnit ?? 0) * l.quantite, 0));
  // Domotique : même formule que l'écran Domotique (arrondi au centime par ligne)
  const dom = blocs.find((b) => b.bloc === 'Domotique')!;
  const attendu = r.lignes.filter((l) => l.bloc === 'Domotique')
    .reduce((a, l) => a + l.quantite * (Math.round(l.pu! * l.coefMat! * 100) / 100 + Math.round(l.moUnit! * l.tauxMo! * l.coefMo! * 100) / 100), 0);
  assert.equal(dom.total, Math.round(attendu * 100) / 100);
  assert.equal(general.total, Math.round(blocs.reduce((a, b) => a + (b.total ?? 0), 0) * 100) / 100);
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

test('TGBT tétra : départs des TD répartis sur les phases', () => {
  const d = villaDemo();
  d.pieces.find((p) => p.tableau.choix === 'TGBT')!.tableau.phase = 'tetra';
  d.pieces.find((p) => p.nom === 'Cuisine')!.tableau.phase = 'tetra';
  const r = calculer(d, params);
  const t = r.tableaux.find((x) => x.id === 'TGBT')!;
  assert.equal(t.ensemble, 'ENSETGBTT');
  assert.ok(t.phases);
  // TD Chambre 1 (mono, 6 mm²) : départ 1P+N 300 mA sur une phase ; TD Cuisine (tétra) : départ 4P 300 mA
  assert.match(t.departs.D32[0][0], /^L[123] · Départ TD Chambre 1$/);
  assert.deepEqual(t.departs.DD4_C32_AC300, [['Départ TD Cuisine']]);
  assert.ok(!r.alertes.some((a) => /à prévoir à la main/.test(a.message)));
  // un TD tétra sous un TGBT monophasé reste à faire à la main
  d.pieces.find((p) => p.tableau.choix === 'TGBT')!.tableau.phase = 'mono';
  assert.ok(calculer(d, params).alertes.some((a) => /Départ des TD tétra \(TD Cuisine\) à prévoir à la main/.test(a.message)));
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
