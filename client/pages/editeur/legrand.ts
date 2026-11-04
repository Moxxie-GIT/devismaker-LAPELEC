// Appareils modulaires en 3D, dessinés d'après la gamme Legrand utilisée dans les ensembles :
// disjoncteurs DNX³ 1P+N, interrupteurs différentiels DX³-ID, disjoncteurs différentiels 300 mA,
// interrupteurs-sectionneurs DX³-IS, télérupteur et horloge.
// Seul le nez de l'appareil dépasse du plastron : c'est lui qui porte la manette et le marquage.
import {
  BufferGeometry, CanvasTexture, ExtrudeGeometry, Group, Material, Mesh, MeshStandardMaterial, PlaneGeometry, Shape, SRGBColorSpace,
  BoxGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Mod } from '../../lib/coffret';

export interface Cotes { W: number; FENETRE: number; Z_FACE: number; Z_FOND: number }

type Genre = 'dnx' | 'id' | 'diff' | 'is' | 'tl' | 'horloge';

function genre(m: Mod): Genre {
  if (m.cle === 'IDAC' || m.cle === 'IDA') return 'id';
  if (m.cle === 'D32' || m.cle === 'D40') return 'diff';
  if (m.etat === 'fixe') {
    const r = m.rep.toUpperCase();
    if (r.startsWith('IS')) return 'is';
    if (r.startsWith('TL')) return 'tl';
    if (r.includes('HORLOGE')) return 'horloge';
  }
  return 'dnx';
}

const TEINTE = { inclus: 0xf8f8f5, ajoute: 0xdbe7f8, inutile: 0xd2d7d6, fixe: 0xf2f2ed };
const MANETTE = 0x3a4046;      // anthracite
const BOUTON_TEST = 0xc9ced0;
const BLEU = 0x1f5fae;
const K = 96;                  // pixels par centimètre pour le marquage

// ---- marquage de la face avant (canvas, coordonnées en cm depuis le centre, y vers le haut)
class Face {
  c = document.createElement('canvas');
  g: CanvasRenderingContext2D;
  constructor(private w: number, private h: number) {
    this.c.width = Math.round(w * K); this.c.height = Math.round(h * K);
    this.g = this.c.getContext('2d')!;
  }
  X(x: number) { return (x + this.w / 2) * K; }
  Y(y: number) { return (this.h / 2 - y) * K; }
  texte(s: string, x: number, y: number, taille: number, o: { gras?: boolean; couleur?: string; align?: CanvasTextAlign; din?: boolean; max?: number } = {}) {
    const g = this.g;
    let t = taille * K;
    const police = () => `${o.gras ? 700 : 500} ${t}px ${o.din ? 'Bahnschrift, "DIN Alternate", "Arial Narrow", sans-serif' : 'Arial, Helvetica, sans-serif'}`;
    g.font = police();
    const max = (o.max ?? this.w - 0.12) * K;
    while (t > 8 && g.measureText(s).width > max) { t -= 1; g.font = police(); }
    g.fillStyle = o.couleur ?? '#1b2328';
    g.textAlign = o.align ?? 'center';
    g.textBaseline = 'middle';
    g.fillText(s, this.X(x), this.Y(y));
  }
  /** Fente de la manette : creux sombre aux bords adoucis. */
  fente(x: number, y: number, l: number, h: number) {
    const g = this.g;
    const r = 0.12 * K;
    const x0 = this.X(x - l / 2), y0 = this.Y(y + h / 2), lw = l * K, lh = h * K;
    const d = g.createLinearGradient(0, y0, 0, y0 + lh);
    d.addColorStop(0, '#15191c'); d.addColorStop(0.5, '#2a3035'); d.addColorStop(1, '#15191c');
    g.fillStyle = d;
    g.beginPath(); g.roundRect(x0, y0, lw, lh, r); g.fill();
  }
  /** Voyant de position des contacts : rouge = fermé (I), vert = ouvert (O). */
  voyant(x: number, y: number, ferme: boolean) {
    const g = this.g;
    g.fillStyle = ferme ? '#c8312b' : '#2f8f4e';
    g.beginPath(); g.roundRect(this.X(x - 0.26), this.Y(y + 0.13), 0.52 * K, 0.26 * K, 0.05 * K); g.fill();
    this.texte(ferme ? 'I' : 'O', x, y - 0.005, 0.2, { gras: true, couleur: '#fff' });
  }
  cadre(s: string, x: number, y: number, l: number) {
    const g = this.g;
    g.strokeStyle = '#3d464c'; g.lineWidth = 0.025 * K;
    g.strokeRect(this.X(x - l / 2), this.Y(y + 0.15), l * K, 0.3 * K);
    this.texte(s, x, y, 0.2, { gras: true, couleur: '#3d464c', din: true, max: l - 0.06 });
  }
  /** Symbole du type de différentiel : AC = sinusoïde, A = sinusoïde + alternances redressées. */
  symbole(x: number, y: number, typeA: boolean) {
    const g = this.g;
    g.strokeStyle = '#1b2328'; g.lineWidth = 0.035 * K; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const u = i / 24, px = this.X(x - 0.3 + u * 0.6), py = this.Y(y + (typeA ? 0.1 : 0) + Math.sin(u * Math.PI * 2) * 0.1);
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.stroke();
    if (typeA) {
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const u = i / 24, px = this.X(x - 0.3 + u * 0.6), py = this.Y(y - 0.18 + Math.abs(Math.sin(u * Math.PI * 2)) * 0.1);
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
    }
  }
}

export class Atelier {
  private geos = new Map<string, BufferGeometry>();
  private textures = new Map<string, CanvasTexture>();
  private mats = new Map<string, Material>();

  constructor(private k: Cotes) {}

  private geo<T extends BufferGeometry>(cle: string, faire: () => T): T {
    let g = this.geos.get(cle) as T | undefined;
    if (!g) { g = faire(); this.geos.set(cle, g); }
    return g;
  }
  private mat(cle: string, faire: () => Material) {
    let m = this.mats.get(cle);
    if (!m) { m = faire(); this.mats.set(cle, m); }
    return m;
  }

  /** Manette à levier : profil arrondi extrudé sur sa largeur, pivot au fond de la fente. */
  private manette(largeur: number) {
    return this.geo(`manette${largeur}`, () => {
      const s = new Shape();
      s.moveTo(-0.3, -0.42); s.lineTo(0.55, -0.33); s.quadraticCurveTo(0.98, 0, 0.55, 0.33); s.lineTo(-0.3, 0.42); s.closePath();
      const g = new ExtrudeGeometry(s, { depth: largeur, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 });
      g.rotateY(-Math.PI / 2);          // profil (avant, hauteur) → (z, y), largeur sur x
      g.translate(largeur / 2, 0, 0);
      return g;
    });
  }

  private marquage(m: Mod, type: Genre, fw: number, fh: number, w: number): CanvasTexture {
    const ajoute = m.etat === 'ajoute', ferme = m.etat !== 'inutile';
    const cle = `${type}|${m.rep}|${fw.toFixed(2)}|${ajoute}|${ferme}`;
    let t = this.textures.get(cle);
    if (t) return t;
    const f = new Face(fw, fh);
    const haut = fh / 2;
    const gris = '#5d666c';
    const calibre = ajoute ? '#174a88' : '#1b2328';
    const [l1, l2 = ''] = m.rep.split('\n');
    const ref = (m.ref ?? '').replace(/^Leg\s*/i, '');                                // « Leg 406783 » → « 406783 »
    const intensite = /(\d+)\s*A\b/.exec(m.nom.replace(/\d+\s*mA/gi, ''))?.[1];      // calibre lu dans la désignation

    if (type === 'dnx') {
      f.texte('legrand', 0, haut - 0.28, 0.25, { gras: true, couleur: gris });
      f.texte(l1, 0, haut - 0.82, 0.56, { gras: true, din: true, couleur: calibre });
      f.fente(0, 0, 1.0, 1.9);
      f.texte('DNX³', 0, -1.1, 0.24, { gras: true, din: true, couleur: '#3d464c' });
      f.cadre('4500', 0, -1.42, 0.78);
      if (ref) f.texte(ref, 0, -1.72, 0.16, { couleur: gris, din: true });
      f.voyant(0, -1.98, ferme);
    } else if (type === 'id' || type === 'diff') {
      const g = -w / 4, d = w / 4;
      f.texte('legrand', -fw / 2 + 0.12, haut - 0.26, 0.24, { gras: true, couleur: gris, align: 'left' });
      f.texte(type === 'id' ? 'DX³-ID' : 'DX³ 4500', fw / 2 - 0.12, haut - 0.26, 0.21, { gras: true, din: true, couleur: '#3d464c', align: 'right' });
      const titre = type === 'id' ? `ID ${intensite ?? 63}A · 30mA` : `${l1} · ${l2 || '300mA'}`;
      f.texte(titre, 0, haut - 0.8, 0.44, { gras: true, din: true, couleur: calibre });
      f.fente(g, 0, 1.0, 1.9);
      // bouton test (le relief est un objet à part, ici son encadrement)
      f.g.strokeStyle = '#8f989c'; f.g.lineWidth = 0.025 * K;
      f.g.strokeRect(f.X(d - 0.36), f.Y(0.71), 0.72 * K, 0.72 * K);
      f.texte('T', d + 0.52, 0.35, 0.22, { gras: true, couleur: '#3d464c' });
      const typeA = m.cle === 'IDA';
      f.symbole(d, -0.42, typeA);
      f.texte(type === 'id' ? (typeA ? 'type A' : 'type AC') : 'type AC', d, -0.82, 0.22, { gras: true, couleur: '#3d464c' });
      f.voyant(g, -1.55, ferme);
      f.texte(type === 'id' ? 'IΔn 30 mA' : 'IΔn 300 mA', d, -1.55, 0.2, { couleur: '#3d464c' });
      f.texte(ref ? `230 V~   ${ref}` : '230 V~', 0, -1.95, 0.17, { couleur: gris, din: true });
    } else if (type === 'is') {
      f.texte('legrand', -fw / 2 + 0.12, haut - 0.26, 0.24, { gras: true, couleur: gris, align: 'left' });
      f.texte('DX³-IS', fw / 2 - 0.12, haut - 0.26, 0.21, { gras: true, din: true, couleur: '#3d464c', align: 'right' });
      f.texte(m.rep, 0, haut - 0.8, 0.46, { gras: true, din: true, couleur: calibre });
      f.fente(0, 0, fw - 0.6, 1.9);
      f.texte('I-ON   O-OFF', 0, -1.3, 0.2, { gras: true, couleur: '#3d464c' });
      f.voyant(0, -1.8, ferme);
    } else if (type === 'tl') {
      f.texte('legrand', 0, haut - 0.28, 0.25, { gras: true, couleur: gris });
      f.texte(m.rep, 0, haut - 0.8, 0.4, { gras: true, din: true, couleur: calibre });
      f.fente(0, 0, 0.72, 1.4);
      f.texte('230 V~', 0, -1.25, 0.2, { couleur: '#3d464c' });
      f.g.fillStyle = ferme ? '#e8a33a' : '#9aa2a5';
      f.g.beginPath(); f.g.arc(f.X(0), f.Y(-1.7), 0.12 * K, 0, Math.PI * 2); f.g.fill();
    } else {
      f.texte('legrand', 0, haut - 0.28, 0.25, { gras: true, couleur: gris });
      f.texte('HORLOGE', 0, haut - 0.72, 0.24, { gras: true, din: true, couleur: calibre });
      for (const [i, s] of ['◄', '►', 'OK'].entries()) {
        const x = (i - 1) * 0.42;
        f.g.fillStyle = '#c9ced0'; f.g.beginPath(); f.g.arc(f.X(x), f.Y(-0.9), 0.16 * K, 0, Math.PI * 2); f.g.fill();
        f.texte(s, x, -1.25, 0.15, { gras: true, couleur: '#3d464c' });
      }
      f.texte('230 V~', 0, -1.75, 0.18, { couleur: gris });
    }
    t = new CanvasTexture(f.c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    this.textures.set(cle, t);
    return t;
  }

  /** Fabrique l'appareil. Les matériaux du boîtier sont propres à l'appareil (surbrillance au survol). */
  fabriquer(m: Mod): { groupe: Group; surbrillance: MeshStandardMaterial[] } {
    const { W, FENETRE, Z_FACE, Z_FOND } = this.k;
    const type = genre(m);
    const w = m.largeur * W - 0.07;
    const ferme = m.etat !== 'inutile';
    const teinte = m.etat === 'ajoute' ? TEINTE.ajoute : m.etat === 'inutile' ? TEINTE.inutile : m.etat === 'fixe' ? TEINTE.fixe : TEINTE.inclus;
    const g = new Group();

    const mCorps = new MeshStandardMaterial({ color: teinte, roughness: 0.6 });
    const mNez = new MeshStandardMaterial({ color: teinte, roughness: 0.38 });

    // boîtier arrière (caché par le plastron) et nez arrondi qui dépasse
    const prof = Z_FACE - (Z_FOND + 1);
    const corps = new Mesh(this.geo(`corps${m.largeur}`, () => new RoundedBoxGeometry(w, 8.4, prof, 2, 0.14)), mCorps);
    corps.position.z = Z_FOND + 1 + prof / 2;
    const hNez = FENETRE - 0.12, pNez = 1.75;
    const nez = new Mesh(this.geo(`nez${m.largeur}`, () => new RoundedBoxGeometry(w, hNez, pNez, 4, 0.26)), mNez);
    nez.position.z = Z_FACE + pNez / 2 - 0.02;
    corps.castShadow = corps.receiveShadow = nez.castShadow = nez.receiveShadow = true;
    g.add(corps, nez);
    const zAvant = Z_FACE + pNez - 0.02;

    // marquage imprimé
    const fw = w - 0.3, fh = hNez - 0.38;
    const tex = this.marquage(m, type, fw, fh, w);
    const mImp = this.mat(`imp${tex.uuid}`, () => new MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.45, depthWrite: false }));
    const imp = new Mesh(this.geo(`imp${fw.toFixed(2)}`, () => new PlaneGeometry(fw, fh)), mImp);
    imp.position.z = zAvant + 0.004;
    g.add(imp);

    const mMan = this.mat('manette', () => new MeshStandardMaterial({ color: MANETTE, roughness: 0.42 }));
    const levier = (largeur: number, x: number) => {
      const l = new Mesh(this.manette(largeur), mMan);
      l.position.set(x, 0, zAvant - 0.22);
      l.rotation.x = ferme ? -0.45 : 0.45;        // levier relevé = en service
      l.castShadow = true;
      g.add(l);
    };

    if (type === 'dnx') levier(0.78, 0);
    else if (type === 'tl') levier(0.5, 0);
    else if (type === 'is') levier(w - 0.85, 0);
    else if (type === 'id' || type === 'diff') {
      levier(0.82, -w / 4);
      const bouton = new Mesh(
        this.geo('test', () => new RoundedBoxGeometry(0.56, 0.56, 0.32, 2, 0.1)),
        this.mat('test', () => new MeshStandardMaterial({ color: BOUTON_TEST, roughness: 0.5 })),
      );
      bouton.position.set(w / 4, 0.35, zAvant + 0.1);
      bouton.castShadow = true;
      g.add(bouton);
    } else {
      // horloge : afficheur à cristaux liquides
      const ecran = new Mesh(
        this.geo(`ecran${m.largeur}`, () => new BoxGeometry(w - 0.42, 1.05, 0.08)),
        this.mat('ecran', () => new MeshStandardMaterial({ color: 0x9db0a4, roughness: 0.2, emissive: 0x334a3c, emissiveIntensity: 0.25 })),
      );
      ecran.position.set(0, 0.32, zAvant + 0.02);
      g.add(ecran);
    }

    // appareil à ajouter : liseré bleu sur le dessus du nez
    if (m.etat === 'ajoute') {
      const bande = new Mesh(
        this.geo(`bande${m.largeur}`, () => new BoxGeometry(w - 0.3, 0.07, 1.2)),
        this.mat('bande', () => new MeshStandardMaterial({ color: BLEU, roughness: 0.4, emissive: BLEU, emissiveIntensity: 0.3 })),
      );
      bande.position.set(0, hNez / 2 + 0.01, Z_FACE + 0.9);
      g.add(bande);
    }

    return { groupe: g, surbrillance: [mCorps, mNez] };
  }

  dispose() {
    for (const g of this.geos.values()) g.dispose();
    for (const t of this.textures.values()) t.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.geos.clear(); this.textures.clear(); this.mats.clear();
  }
}
