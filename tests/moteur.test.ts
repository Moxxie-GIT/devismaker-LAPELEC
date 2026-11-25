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

test('TD plein : deuxième coffret à côté, alimenté par le premier', () => {
  const d = villaDemo();
  d.pieces.find((p) => p.nom === 'Chambre 1')!.elements.push(nouvelElement('CLIM', 12));
  const r = calculer(d, params);
  const t = r.tableaux.find((x) => x.nom === 'TD Chambre 1')!;
  assert.equal(t.coffrets, 2);
  assert.ok(r.alertes.some((a) => /TD Chambre 1 : le coffret est plein .*Deuxième coffret/.test(a.message)));
  // coffret, porte et peigne vertical de l'ensemble passent de 1 à 2
  const ch = r.aModifier.find((a) => a.tableau === 'TD Chambre 1')!.changements.filter((c) => c.cle.startsWith('EXT'));
  assert.deepEqual(ch.map((c) => `${c.ref}:${c.base}>${c.final}`), ['Leg 401213:1>2', 'Leg 093032:1>2', 'Leg 405001:1>2']);
  // tout tient dans les deux coffrets, et les modules KNX ne sont pas coupés entre les deux
  const dsp = disposer(t);
  assert.ok(dsp.rangeesUtiles <= 6);
  const coffretsKnx = new Set(dsp.rangees.flatMap((rg, i) => (rg.some((m) => m.etat === 'knx') ? [dsp.coffretDe(i)] : [])));
  assert.equal(coffretsKnx.size, 1);
  // beaucoup trop pour deux coffrets : on le signale
  d.pieces.find((p) => p.nom === 'Chambre 1')!.elements.push(nouvelElement('CLIM', 60));
  assert.ok(calculer(d, params).alertes.some((a) => /TD Chambre 1 : .*les deux coffrets\. Prévoir un coffret plus grand/.test(a.message)));
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

test('modules KNX : actionneurs dans leur tableau, système au TGBT, sur leurs propres rangées', () => {
  const r = calculer(villaDemo(), params);
  const tgbt = r.tableaux.find((t) => t.id === 'TGBT')!;
  for (const k of ['ALIM', 'HORL', 'IP', 'USB']) {
    assert.equal(tgbt.modules[k], r.domotique!.modules[k], k);
    for (const t of r.tableaux.filter((x) => x.id !== 'TGBT')) assert.ok(!t.modules[k], `${t.nom} : ${k}`);
  }
  const largeur: Record<string, number> = { ALIM: 3, HORL: 3, IP: 2, USB: 2, RM16: 8, RM8: 4, RM4: 4, SM4: 4, DM4T: 4, DALI: 4, JM4T: 4 };
  for (const t of r.tableaux) {
    const d = disposer(t);
    const knx = d.mods.filter((m) => m.etat === 'knx');
    assert.equal(knx.length, Object.values(t.modules).reduce((a, n) => a + n, 0), t.nom);
    for (const m of knx) assert.equal(m.largeur, largeur[m.knx!], `${t.nom} ${m.knx}`);
    // jamais sur la rangée d'un interrupteur différentiel
    for (const rg of d.rangees) assert.ok(!(rg.some((m) => m.etat === 'knx') && rg.some((m) => m.cle.startsWith('ID'))), t.nom);
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

test('sans domotique : pas de bloc Domotique, ni variation, ni bouton KNX', () => {
  const d = villaDemo();
  d.mode = 'CLASSIQUE';
  const r = calculer(d, params);
  assert.equal(r.domotique, null);
  assert.ok(!r.lignes.some((l) => l.bloc === 'Domotique' || l.ref === 'ENSEBP' || l.ref === 'ENSELB'));
  assert.ok(!r.lignes.some((l) => l.designation.endsWith('variation')));
});

test('sans domotique : interrupteur selon le nombre d’endroits, télérupteur au TD dès 3', () => {
  const d = villaDemo();
  d.mode = 'CLASSIQUE';
  const ch = d.pieces[0];
  ch.circuits = [
    { ...ch.circuits[0], nom: 'spot chambre', nb: 5, commandes: 3 },     // entrée + les deux côtés du lit
    { ...ch.circuits[1], nom: 'LED chambre', nb: 1, commandes: 2 },
    { ...ch.circuits[2], nom: 'liseuse', nb: 2, commandes: 0 },          // interrupteur sur la liseuse
    { ...ch.circuits[3], nom: 'spot salle de bain', nb: 4, commandes: 1 },
    { ...ch.circuits[4], nom: 'spot dressing', nb: 2, commandes: 4 },
  ];
  ch.classique = { sa: 1, vv: 0, bps: 0 };                                // un interrupteur hors éclairage
  const r = calculer(d, params);
  const inter = r.lignes.filter((l) => l.bloc === 'Chambre 1' && /^ENSE(SA|VV|BPS)$/.test(l.ref ?? '')).map((l) => `${l.ref} ${l.designation} : ${l.quantite}`);
  assert.deepEqual(inter, [
    'ENSEBPS Interrupteur boutons poussoirs (spot chambre) : 3',
    'ENSEVV Interrupteur va et vient (LED chambre) : 2',
    'ENSESA Interrupteur simple allumage (spot salle de bain) : 1',
    'ENSEBPS Interrupteur boutons poussoirs (spot dressing) : 4',
    'ENSESA Interrupteur simple allumage : 1',
  ]);
  // deux circuits en boutons poussoirs : deux télérupteurs dans le TD, un déjà dans l'ensemble ENSETD1
  const td = r.tableaux.find((t) => t.nom === 'TD Chambre 1')!;
  const tl = td.protections.find((p) => p.cle === 'TL')!;
  assert.deepEqual([tl.besoin, tl.base, tl.final, tl.ref], [2, 1, 2, 'Leg 412400']);
  assert.deepEqual(td.departs.TL, [['spot chambre (Chambre 1)'], ['spot dressing (Chambre 1)']]);
  assert.ok(r.aModifier.find((m) => m.tableau === 'TD Chambre 1')!.changements.some((c) => c.cle === 'TL' && c.final === 2));
  // les télérupteurs ne comptent pas comme circuits sous un différentiel : groupe à part, étiquetés
  assert.ok(td.groupes!.every((g) => !g.tete || g.membres.every((m) => m.cle !== 'TL')));
  const mods = disposer(td).mods.filter((m) => m.cle === 'TL');
  assert.deepEqual(mods.map((m) => [m.etat, m.fonctions?.[0], m.type]), [['', 'spot chambre (Chambre 1)', 'tl'], ['ajoute', 'spot dressing (Chambre 1)', 'tl']]);
});

test('avec domotique : les endroits de commande ne produisent aucun interrupteur ni télérupteur', () => {
  const d = villaDemo();
  d.pieces[0].circuits[0].commandes = 4;
  const r = calculer(d, params);
  assert.ok(!r.lignes.some((l) => /^ENSE(SA|VV|BPS)$/.test(l.ref ?? '')));
  const tl = r.tableaux.find((t) => t.nom === 'TD Chambre 1')!.protections.find((p) => p.cle === 'TL')!;
  assert.deepEqual([tl.besoin, tl.final], [0, 1]);   // celui de l'ensemble, facturé, en réserve
});

test('ancien devis sans domotique : les interrupteurs comptés à la main restent tels quels', async () => {
  const { normaliserDevisData } = await import('../shared/lots');
  const d = normaliserDevisData({
    mode: 'CLASSIQUE',
    pieces: [
      { id: 'a', nom: 'Chambre 1', type: 'chambre', tableau: { choix: 'TGBT' }, classique: { sa: 2, vv: 1, bps: 0 }, circuits: [{ id: 'c', nom: 'Spot', nb: 6 }] },
      { id: 'b', nom: 'Salon', type: 'salon', tableau: { choix: 'AUCUN' }, circuits: [{ id: 'd', nom: 'Suspente', nb: 2 }] },
    ],
  });
  assert.equal(d.pieces[0].circuits[0].commandes, 0);
  assert.equal(d.pieces[1].circuits[0].commandes, 1);
  const r = calculer(d, params);
  assert.deepEqual(r.lignes.filter((l) => /^ENSE(SA|VV)$/.test(l.ref ?? '')).map((l) => `${l.bloc} ${l.ref} ${l.quantite}`),
    ['Chambre 1 ENSESA 2', 'Chambre 1 ENSEVV 1', 'Salon ENSESA 1']);
});

test('liaison équipotentielle d’une baie vitrée près de la piscine : ensemble ENSELE', () => {
  const d = villaDemo();
  d.pieces[0].elements.push(nouvelElement('ELEB', 2));
  const r = calculer(d, params);
  const l = r.lignes.find((x) => x.designation === 'Liaison équipotentielle baie vitrée (proximité piscine)')!;
  assert.deepEqual([l.ref, l.quantite, l.bloc], ['ENSELE', 2, 'Chambre 1']);
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

test('logements identiques : N° « Villa 1.Chambre 1 », sous-bloc de chaque pièce dans le bloc du logement', () => {
  const un = calculer(villaDemo(), params);
  const deux = calculer({ ...villaDemo(), logements: 2, nomLogements: 'Villa' }, params);
  const blocs = [...new Set(un.lignes.map((l) => l.bloc))];
  // pour chaque logement, chaque bloc avec exactement les mêmes lignes, préfixé du logement (séparateur « . »)
  const attendu: typeof un.lignes = [];
  for (const k of [1, 2]) for (const b of blocs) {
    for (const l of un.lignes.filter((x) => x.bloc === b)) attendu.push({ ...l, bloc: `Villa ${k}.${b}` });
  }
  assert.deepEqual(deux.lignes, attendu);
  assert.ok(blocs.includes('Domotique') && blocs.includes('Divers'));
  assert.equal(deux.lignes[0].bloc, 'Villa 1.Chambre 1');
  // un logement : mêmes tableaux et mêmes changements d'ensemble (à faire dans chaque logement)
  assert.deepEqual(deux.tableaux, un.tableaux);
  assert.deepEqual(deux.aModifier, un.aModifier);
  // totaux : chaque bloc de chaque logement, total général = 2 × un logement
  const t1 = totauxParBloc(un.lignes), t2 = totauxParBloc(deux.lignes);
  assert.equal(t2.blocs[0].bloc, 'Villa 1 › Chambre 1');
  assert.equal(t2.blocs.length, t1.blocs.length * 2);
  assert.ok(Math.abs(t2.general.heures - t1.general.heures * 2) < 0.05);
  if (t1.general.total != null) assert.ok(Math.abs(t2.general.total! - t1.general.total * 2) < 0.05);
});

test('noms de blocs : pas de point (séparateur des sous-blocs dans Esabora)', () => {
  const d = villaDemo();
  d.pieces[0].nom = ' Ch.  parents ';
  const r = calculer({ ...d, logements: 2, nomLogements: 'Lot A.' }, params);
  assert.ok(r.lignes.some((l) => l.bloc === 'Lot A 1.Ch parents'));
  assert.ok(r.lignes.every((l) => !l.bloc || l.bloc.split('.').length === 2));
  // un nom fait seulement de points reste une pièce sans nom
  d.pieces[0].nom = '..';
  assert.ok(calculer(d, params).alertes.some((a) => a.niveau === 'erreur' && a.message.includes('pas de nom')));
});

test('logements : valeur absente ou invalide ramenée à 1', async () => {
  const { normaliserDevisData } = await import('../shared/lots');
  assert.equal(normaliserDevisData({}).logements, 1);
  assert.equal(normaliserDevisData({ logements: 0 }).logements, 1);
  assert.equal(normaliserDevisData({ logements: 3 }).logements, 3);
  assert.equal(normaliserDevisData({ logements: 999 }).logements, 50);
  assert.equal(normaliserDevisData({}).nomLogements, 'Maison');
});

test('texte de fin : après le bloc Divers, hors bloc, sans quantité, pas dans les totaux', () => {
  const p = { ...params, textesFin: ['Garanties :', '  ', 'Une remise pourra être effectuée.'] };
  const r = calculer(villaDemo(), p);
  const fin = r.lignes.slice(-2);
  assert.deepEqual(fin, [
    { bloc: '', ref: null, designation: 'Garanties :', quantite: null },
    { bloc: '', ref: null, designation: 'Une remise pourra être effectuée.', quantite: null },
  ]);
  assert.equal(r.lignes[r.lignes.length - 3].bloc, 'Divers');
  assert.ok(!totauxParBloc(r.lignes).blocs.some((b) => !b.bloc));
  assert.ok(parametresParDefaut().textesFin.some((t) => t.includes('gamme Céliane')));
  // plusieurs logements : toujours une seule fois, tout à la fin
  const r2 = calculer({ ...villaDemo(), logements: 2 }, p);
  assert.deepEqual(r2.lignes.slice(-2), fin);
  assert.equal(r2.lignes[r2.lignes.length - 3].bloc, 'Maison 2.Divers');
});
