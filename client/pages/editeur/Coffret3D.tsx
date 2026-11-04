// Vue 3D d'un tableau : coffret, rails DIN, plastron avec porte-étiquettes, disjoncteurs.
// Chargée à la demande (three.js n'est téléchargé que si la vue 3D est affichée).
// Le rendu se fait seulement quand quelque chose bouge : aucune boucle quand la vue est immobile.
import { useEffect, useRef } from 'react';
import {
  Box3, BoxGeometry, CanvasTexture, Color, DirectionalLight, ExtrudeGeometry, Group, HemisphereLight, Material, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, NeutralToneMapping, Object3D, PCFShadowMap, PerspectiveCamera, PlaneGeometry,
  PMREMGenerator, Raycaster, Scene, Shape, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, BufferGeometry, Path,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { TableauCalcule } from '../../../shared/types';
import { LIBELLE_ETAT, PAR_RANGEE, disposition, type Mod } from '../../lib/coffret';
import { Atelier } from './legrand';

// ---- dimensions en centimètres (un module DIN fait 18 mm)
const W = 1.8;
const PAS = 11;            // entraxe des rails
const FENETRE = 4.8;       // découpe du plastron (le nez des appareils passe au travers)
const MARGE = 1.8;
const LARG_UTILE = PAR_RANGEE * W;
const LARG = LARG_UTILE + 2 * MARGE;
const Z_FOND = -3.3;
const Z_FACE = 2.75;       // face avant du corps des appareils = arrière du plastron
const EP_PLASTRON = 0.32;

// coffret et rails ; les appareils eux-mêmes sont dans legrand.ts
const C = { plastron: 0xe1e4e0, coffret: 0xc9cfcc, fond: 0xb9c0bd, rail: 0xc4cbcc, survol: 0x1f5fae };

export function longueurVue(nbRangees: number) {
  return { largeur: LARG + 0.8, hauteur: nbRangees * PAS + 1.6 };
}

function reduitMouvement() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

const HAUT_ETIQ = 2.4;     // hauteur du porte-étiquette (cm)
const PX_MODULE = 120;     // résolution du porte-étiquette : pixels par module

/** Coupe un texte en lignes qui tiennent dans « largeur » pixels avec la police courante. */
function couper(g: CanvasRenderingContext2D, texte: string, largeur: number): string[] {
  const lignes: string[] = [];
  let cur = '';
  for (const mot of texte.split(/\s+/).filter(Boolean)) {
    const essai = cur ? `${cur} ${mot}` : mot;
    if (cur && g.measureText(essai).width > largeur) { lignes.push(cur); cur = mot; } else cur = essai;
  }
  if (cur) lignes.push(cur);
  return lignes;
}

/** Écrit les fonctions d'un disjoncteur dans sa case, en réduisant la police jusqu'à ce que tout tienne. */
function ecrireFonctions(g: CanvasRenderingContext2D, fonctions: string[], x: number, w: number, h: number, couleur: string) {
  const marge = 7, utile = w - 2 * marge, dispo = h - 2 * marge - 6;
  const police = (t: number) => `600 ${t}px Bahnschrift, "Segoe UI", "Arial Narrow", sans-serif`;
  try { (g as any).fontStretch = 'semi-condensed'; } catch { /* navigateur sans fontStretch */ }
  let taille = 25, blocs: string[][] = [];
  const hauteur = (t: number, b: string[][]) => b.reduce((a, l) => a + l.length, 0) * t * 1.08 + (b.length - 1) * t * 0.35;
  for (; taille >= 13; taille--) {
    g.font = police(taille);
    blocs = fonctions.map((f) => couper(g, f, utile));
    const tropLarge = blocs.some((l) => l.some((s) => g.measureText(s).width > utile));
    if (!tropLarge && hauteur(taille, blocs) <= dispo) break;
  }
  taille = Math.max(13, taille);
  g.font = police(taille);
  // si ça ne tient toujours pas, on garde ce qui entre et on termine par « … »
  let lignes = blocs.flatMap((l, i) => (i ? ['', ...l] : l));
  const max = Math.floor(dispo / (taille * 1.08));
  if (lignes.length > max) lignes = [...lignes.slice(0, max - 1), `${lignes[max - 1]}…`];
  const hTotal = lignes.reduce((a, l) => a + (l ? taille * 1.08 : taille * 0.35), 0);
  let y = (h - hTotal) / 2 + taille * 0.54;
  g.fillStyle = couleur; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const l of lignes) {
    if (!l) { // séparation entre deux fonctions
      g.fillStyle = '#c3cbc9'; g.fillRect(x + w * 0.3, y - taille * 0.54 + taille * 0.1, w * 0.4, 1.5); g.fillStyle = couleur;
      y += taille * 0.35; continue;
    }
    g.fillText(l, x + w / 2, y, utile);
    y += taille * 1.08;
  }
}

/** Bande du porte-étiquette d'une rangée : la fonction de chaque disjoncteur, comme on l'écrit sur un vrai tableau. */
function texteRangee(r: Mod[]): CanvasTexture {
  const px = PX_MODULE;
  const c = document.createElement('canvas');
  c.width = PAR_RANGEE * px; c.height = Math.round((px * HAUT_ETIQ) / W);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fdfdfb'; g.fillRect(0, 0, c.width, c.height);
  let x = 0;
  for (const m of r) {
    const w = m.largeur * px;
    if (m.etat === 'ajoute') {
      g.fillStyle = '#e3ecf9'; g.fillRect(x, 0, w, c.height);
      g.fillStyle = '#1f5fae'; g.fillRect(x, c.height - 8, w, 8);
    } else if (m.etat === 'inutile') {
      g.save(); g.beginPath(); g.rect(x, 0, w, c.height); g.clip();
      g.strokeStyle = '#e6e9e8'; g.lineWidth = 8;
      for (let k = -c.height; k < w + c.height; k += 22) { g.beginPath(); g.moveTo(x + k, c.height); g.lineTo(x + k + c.height, 0); g.stroke(); }
      g.restore();
    }
    const couleur = m.etat === 'ajoute' ? '#174a88' : m.etat === 'inutile' ? '#8f999c' : m.etat === 'fixe' ? '#4a5862' : '#1c2730';
    if (m.fonctions?.length) ecrireFonctions(g, m.fonctions, x, w, c.height, couleur);
    else if (m.etat === 'inutile') ecrireFonctions(g, ['Réserve'], x, w, c.height, couleur);
    else if (m.etat !== 'libre' && m.rep) {
      // différentiels et appareils fixes : leur repère
      const lignes = m.rep.split('\n');
      g.fillStyle = couleur; g.textAlign = 'center'; g.textBaseline = 'middle';
      lignes.forEach((l, i) => {
        let taille = i === 0 ? 38 : 26;
        const police = (t: number) => `${i === 0 ? 600 : 400} ${t}px Bahnschrift, "DIN Alternate", "Arial Narrow", sans-serif`;
        g.font = police(taille);
        while (taille > 14 && g.measureText(l).width > w - 14) { taille -= 2; g.font = police(taille); }
        const y = lignes.length === 1 ? c.height / 2 : c.height / 2 - 20 + i * 40;
        g.fillText(l, x + w / 2, y);
      });
    }
    x += w;
    g.fillStyle = '#c9d0cf'; g.fillRect(x - 1.5, 10, 3, c.height - 20);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

interface Etiquette { mod: Mod; mats: MeshStandardMaterial[]; base: Color[] }

class Vue {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(26, 1, 1, 400);
  private controls: OrbitControls;
  private contenu = new Group();
  private soleil: DirectionalLight;
  private ray = new Raycaster();
  private souris = new Vector2();
  private cibles: Object3D[] = [];
  private survole: Object3D | null = null;
  private jetables: { dispose(): void }[] = [];
  private geos = new Map<string, BufferGeometry>();
  private raf = 0;
  private anims: { obj: Object3D; depart: number; duree: number; dz: number }[] = [];
  private precedent = new Set<string>();
  private dernierId = '';
  private dernierCadre = '';
  private observateur: ResizeObserver;
  private bulle: HTMLDivElement;
  private direction: Vector3;
  private atelier = new Atelier({ W, FENETRE, Z_FACE, Z_FOND });
  private taille = { w: 0, h: 0 };

  constructor(private hote: HTMLElement, private grand: boolean) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.className = 'toile-3d';
    hote.appendChild(this.renderer.domElement);

    const pmrem = new PMREMGenerator(this.renderer);
    const piece = new RoomEnvironment();
    const env = pmrem.fromScene(piece, 0.04).texture;
    piece.dispose();
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.55;
    this.jetables.push(pmrem, env);

    this.scene.add(new HemisphereLight(0xffffff, 0xa9b3b8, 0.75));
    this.soleil = new DirectionalLight(0xffffff, 2.3);
    this.soleil.castShadow = true;
    this.soleil.shadow.mapSize.set(2048, 2048);
    this.soleil.shadow.bias = -0.0004;
    this.soleil.shadow.normalBias = 0.02;
    this.soleil.shadow.radius = 3;
    this.scene.add(this.soleil, this.soleil.target);
    this.scene.add(this.contenu);

    // vue légèrement de trois quarts, comme quand on ouvre la porte du coffret
    this.direction = new Vector3().setFromSphericalCoords(1, Math.PI / 2 - (grand ? 0.2 : 0.14), grand ? 0.42 : 0.3);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.enablePan = grand;
    this.controls.enableZoom = grand;          // dans le panneau latéral, la molette fait défiler la page
    this.controls.minAzimuthAngle = -1.15; this.controls.maxAzimuthAngle = 1.15;
    this.controls.minPolarAngle = 0.55; this.controls.maxPolarAngle = 2.05;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomToCursor = grand;          // dans la grande vue, la molette zoome vers l'appareil visé
    this.controls.addEventListener('change', () => this.demander());
    // dès qu'on tourne ou zoome, la bulle d'information n'est plus à sa place : on la cache
    this.controls.addEventListener('start', () => {
      this.eclairer(this.survole, false); this.survole = null; this.bulle.hidden = true;
    });

    this.bulle = document.createElement('div');
    this.bulle.className = 'bulle-3d';
    this.bulle.hidden = true;
    hote.appendChild(this.bulle);

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.surMouvement);
    el.addEventListener('pointerleave', this.surSortie);
    el.addEventListener('dblclick', this.recadrer);
    this.observateur = new ResizeObserver(() => this.redimensionner());
    this.observateur.observe(hote);
    this.redimensionner();
  }

  private geo(cle: string, faire: () => BufferGeometry) {
    let g = this.geos.get(cle);
    if (!g) { g = faire(); this.geos.set(cle, g); }
    return g;
  }

  private mat(o: ConstructorParameters<typeof MeshStandardMaterial>[0]) {
    const m = new MeshStandardMaterial(o);
    this.jetables.push(m);
    return m;
  }

  /** Reconstruit le coffret. Les appareils qui n'existaient pas au tour précédent arrivent avec une petite animation. */
  construire(rangees: Mod[][], id: string) {
    for (const o of [...this.contenu.children]) this.contenu.remove(o);
    for (const j of this.jetables.splice(2)) j.dispose();   // garde l'environnement (2 premiers)
    this.cibles = []; this.survole = null; this.bulle.hidden = true;
    if (id !== this.dernierId) { this.precedent = new Set(); this.dernierId = id; }

    const n = Math.max(1, rangees.length);
    const haut = n * PAS + 1.2;
    const yRang = (i: number) => haut / 2 - 0.6 - PAS / 2 - i * PAS;

    // coffret : fond et bords
    const mCoffret = this.mat({ color: C.coffret, roughness: 0.55 });
    const fond = new Mesh(new BoxGeometry(LARG + 0.8, haut + 0.8, 0.3), this.mat({ color: C.fond, roughness: 0.7 }));
    fond.position.z = Z_FOND - 0.15; fond.receiveShadow = true;
    this.contenu.add(fond);
    const prof = Z_FACE - Z_FOND;
    for (const [w, h, x, y] of [[LARG + 0.8, 0.4, 0, haut / 2 + 0.2], [LARG + 0.8, 0.4, 0, -haut / 2 - 0.2], [0.4, haut + 0.8, LARG / 2 + 0.2, 0], [0.4, haut + 0.8, -LARG / 2 - 0.2, 0]]) {
      const b = new Mesh(new BoxGeometry(w, h, prof), mCoffret);
      b.position.set(x, y, Z_FOND + prof / 2); b.castShadow = b.receiveShadow = true;
      this.contenu.add(b);
      this.jetables.push(b.geometry);
    }
    this.jetables.push(fond.geometry);

    // plastron découpé à la hauteur de chaque rail
    const forme = new Shape();
    forme.moveTo(-LARG / 2, -haut / 2); forme.lineTo(LARG / 2, -haut / 2); forme.lineTo(LARG / 2, haut / 2); forme.lineTo(-LARG / 2, haut / 2); forme.closePath();
    for (let i = 0; i < n; i++) {
      const y = yRang(i), l = LARG_UTILE / 2 + 0.08, h = FENETRE / 2;
      const trou = new Path();
      trou.moveTo(-l, y - h); trou.lineTo(-l, y + h); trou.lineTo(l, y + h); trou.lineTo(l, y - h); trou.closePath();
      forme.holes.push(trou);
    }
    const gPlastron = new ExtrudeGeometry(forme, { depth: EP_PLASTRON, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
    const plastron = new Mesh(gPlastron, this.mat({ color: C.plastron, roughness: 0.42 }));
    plastron.position.z = Z_FACE + 0.02; plastron.castShadow = plastron.receiveShadow = true;
    this.contenu.add(plastron);
    this.jetables.push(gPlastron);

    const mRail = this.mat({ color: C.rail, metalness: 0.55, roughness: 0.38 });
    const gRailA = this.geo('railA', () => new BoxGeometry(LARG_UTILE + 1.2, 3.5, 0.12));
    const gRailB = this.geo('railB', () => new BoxGeometry(LARG_UTILE + 1.2, 2.5, 0.75));

    const nouveaux = new Set<string>();
    const animer = !reduitMouvement();
    const maintenant = performance.now();
    let rang = 0;

    rangees.forEach((r, i) => {
      const y = yRang(i);
      const railA = new Mesh(gRailA, mRail); railA.position.set(0, y, Z_FOND + 0.36); railA.receiveShadow = true;
      const railB = new Mesh(gRailB, mRail); railB.position.set(0, y, Z_FOND + 0.6); railB.receiveShadow = true; railB.castShadow = true;
      this.contenu.add(railA, railB);

      // porte-étiquette au-dessus de la découpe
      const tex = texteRangee(r);
      const gEt = new PlaneGeometry(LARG_UTILE, HAUT_ETIQ);
      const et = new Mesh(gEt, new MeshBasicMaterial({ map: tex, toneMapped: false }));
      et.position.set(0, y + FENETRE / 2 + 0.35 + HAUT_ETIQ / 2, Z_FACE + EP_PLASTRON + 0.09);
      this.contenu.add(et);
      this.jetables.push(tex, gEt, et.material as Material);

      let x = -LARG_UTILE / 2;
      r.forEach((m, j) => {
        const w = m.largeur * W;
        const cle = `${i}.${j}.${m.cle}.${m.etat}`;
        nouveaux.add(cle);
        if (m.etat !== 'libre') {
          const app = this.appareil(m);
          app.position.set(x + w / 2, y, 0);
          this.contenu.add(app);
          if (animer && !this.precedent.has(cle)) {
            app.position.z = 3.5;
            this.anims.push({ obj: app, depart: maintenant + rang * 22, duree: 420, dz: 3.5 });
            rang++;
          }
        }
        x += w;
      });
    });
    this.precedent = nouveaux;

    // ombre portée cadrée sur le coffret
    const boite = new Box3().setFromObject(this.contenu);
    const taille = boite.getSize(new Vector3());
    const s = this.soleil.shadow.camera;
    s.left = -taille.x; s.right = taille.x; s.top = taille.y; s.bottom = -taille.y; s.near = 1; s.far = 120;
    s.updateProjectionMatrix();
    this.soleil.position.set(-16, 26, 30);
    this.soleil.target.position.set(0, 0, 0);

    // on ne recadre que si le coffret change de forme : renommer une pièce ne doit pas remettre la vue à zéro
    const cadre = `${id}|${n}`;
    if (cadre !== this.dernierCadre) { this.dernierCadre = cadre; this.recadrer(); } else this.demander();
  }

  private appareil(m: Mod): Group {
    const { groupe, surbrillance } = this.atelier.fabriquer(m);
    this.jetables.push(...surbrillance);
    groupe.userData = { mod: m, mats: surbrillance, base: surbrillance.map((x) => x.emissive.clone()) };
    this.cibles.push(groupe);
    return groupe;
  }

  // ---- interaction
  private surMouvement = (e: PointerEvent) => {
    if (e.buttons) { this.bulle.hidden = true; return; }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.souris.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.souris, this.camera);
    const hit = this.ray.intersectObjects(this.cibles, true)[0];
    let o: Object3D | null = hit?.object ?? null;
    while (o && !o.userData.mod) o = o.parent;
    if (o !== this.survole) {
      this.eclairer(this.survole, false);
      this.eclairer(o, true);
      this.survole = o;
      this.renderer.domElement.style.cursor = o ? 'help' : '';
      this.demander();
    }
    if (o) {
      const m = o.userData.mod as Mod;
      this.bulle.replaceChildren();
      const b = document.createElement('b'); b.textContent = m.rep.replace('\n', ' ');
      const fonctions = (m.fonctions ?? (m.etat === 'inutile' ? ['Réserve'] : [])).map((f) => {
        const s = document.createElement('strong'); s.className = 'fonction'; s.textContent = f; return s;
      });
      const nom = document.createElement('span'); nom.textContent = m.nom && m.nom !== m.rep ? m.nom : '';
      const etat = document.createElement('em'); etat.textContent = LIBELLE_ETAT[m.etat]; etat.className = `etat-${m.etat || 'inclus'}`;
      this.bulle.append(b, ...fonctions, nom, etat);
      this.bulle.hidden = false;
      const hr = this.hote.getBoundingClientRect();
      const x = e.clientX - hr.left, y = e.clientY - hr.top;
      const bw = this.bulle.offsetWidth, bh = this.bulle.offsetHeight;
      this.bulle.style.left = `${Math.min(Math.max(6, x + 14), hr.width - bw - 6)}px`;
      this.bulle.style.top = `${y + 18 + bh > hr.height ? y - bh - 12 : y + 18}px`;
    } else this.bulle.hidden = true;
  };

  private surSortie = () => {
    this.eclairer(this.survole, false); this.survole = null;
    this.bulle.hidden = true; this.demander();
  };

  private eclairer(o: Object3D | null, oui: boolean) {
    if (!o) return;
    const { mats, base } = o.userData as Etiquette;
    mats.forEach((m, i) => { m.emissive.set(oui ? C.survol : base[i]); m.emissiveIntensity = oui ? 0.28 : 1; });
  }

  recadrer = () => {
    const boite = new Box3().setFromObject(this.contenu);
    const centre = boite.getCenter(new Vector3());
    const taille = boite.getSize(new Vector3());
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const d = Math.max((taille.y / 2) / tan, (taille.x / 2) / (tan * this.camera.aspect)) * (this.grand ? 1.0 : 0.99) + taille.z / 2;
    this.camera.position.copy(centre).addScaledVector(this.direction, d);
    this.controls.target.copy(centre);
    this.controls.minDistance = d * 0.35; this.controls.maxDistance = d * 1.8;
    this.camera.near = d / 20; this.camera.far = d * 4;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.demander();
  };

  private redimensionner() {
    const w = this.hote.clientWidth, h = this.hote.clientHeight;
    if (!w || !h || (w === this.taille.w && h === this.taille.h)) return;
    this.taille = { w, h };
    this.renderer.setSize(w, h, false);   // vide le canevas : on redessine aussitôt, sans attendre l'image suivante
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.contenu.children.length) this.recadrer();
    this.renderer.render(this.scene, this.camera);
  }

  // ---- rendu à la demande
  private demander() { if (!this.raf) this.raf = requestAnimationFrame(this.image); }

  private image = () => {
    this.raf = 0;
    const bouge = this.controls.update();
    const t = performance.now();
    this.anims = this.anims.filter((a) => {
      const k = Math.min(1, Math.max(0, (t - a.depart) / a.duree));
      const e = 1 - Math.pow(1 - k, 3);
      a.obj.position.z = a.dz * (1 - e);
      return k < 1;
    });
    this.renderer.render(this.scene, this.camera);
    if (bouge || this.anims.length) this.demander();
  };

  detruire() {
    cancelAnimationFrame(this.raf);
    this.observateur.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.surMouvement);
    el.removeEventListener('pointerleave', this.surSortie);
    el.removeEventListener('dblclick', this.recadrer);
    this.controls.dispose();
    for (const j of this.jetables) j.dispose();
    for (const g of this.geos.values()) g.dispose();
    this.atelier.dispose();
    this.renderer.dispose();
    el.remove(); this.bulle.remove();
  }
}

export default function Coffret3D({ t, grand = false, onErreur }: { t: TableauCalcule; grand?: boolean; onErreur?: () => void }) {
  const hote = useRef<HTMLDivElement>(null);
  const vue = useRef<Vue | null>(null);
  const d = disposition(t);
  // reconstruit la scène si un appareil, son état ou son étiquette change (renommer une pièce change les étiquettes)
  const signature = `${t.id}|${d.rangees.map((r) => r.map((m) => `${m.cle}${m.etat}${m.fonctions?.join('+') ?? ''}`).join(',')).join('/')}`;

  useEffect(() => {
    try { vue.current = new Vue(hote.current!, grand); }
    catch { onErreur?.(); }
    return () => { vue.current?.detruire(); vue.current = null; };
  }, [grand]);

  useEffect(() => { vue.current?.construire(d.rangees, t.id); }, [signature, grand]);

  const { largeur, hauteur } = longueurVue(d.rangees.length);
  return (
    <div
      ref={hote} className={`coffret-3d${grand ? ' grand' : ''}`}
      style={grand ? undefined : { aspectRatio: `${largeur} / ${hauteur * 0.97}` }}
      role="img" aria-label={`Vue 3D de ${t.nom} : ${d.utilises} modules`}
    />
  );
}
