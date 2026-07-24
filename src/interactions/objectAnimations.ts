import * as THREE from "three";

const LIFT_AMOUNT = 0.02;
const LIFT_SPEED = 0.18;

const SWING_DURATION_MS = 900;
const SWING_AMPLITUDE = 0.09;
const SWING_OSCILLATIONS = 4;

const SWING_BACK_DURATION_MS = 700;
const SWING_BACK_AMPLITUDE = 0.35;

const SPIN_DURATION_MS = 900;

const BOUNCE_DURATION_MS = 1100;
const BOUNCE_COUNT = 4;
const BOUNCE_HEIGHT_FACTOR = 2.2;

const MOVE_DURATION_MS = 1400;
// Rayon de déplacement proportionnel à l'empreinte au sol de l'objet lui-même (calculé au
// déclenchement, voir trigger()) plutôt qu'une valeur absolue fixe — un objet plus petit se
// déplace moins, un plus grand un peu plus, en restant "raisonnablement" dans sa zone.
const MOVE_RADIUS_FACTOR_MIN = 0.3;
const MOVE_RADIUS_FACTOR_MAX = 0.6;

const SWAP_DURATION_MS = 1000;

// Vitesse de fondu du "screen" — même logique que LIFT_SPEED : couplé directement au survol
// (pas une timeline fixe), pour s'éteindre aussi vite que le survol se termine.
const SCREEN_GLOW_SPEED = 0.25;
// Calibré par capture d'écran (voir git log) : un bleu quasi-blanc (proche de la couleur de
// base du bloom) blowout en blanc plein dès une intensité ~2 à cause du seuil de bloom
// (postprocessing.ts, 0.95) — un bleu plus saturé reste lisible comme "écran allumé" sans
// tout cramer, même à une intensité plus confortablement au-dessus du seuil.
const SCREEN_EMISSIVE_INTENSITY = 2.5;
const SCREEN_COLOR = new THREE.Color(0x3a6ea5);

const LIGHT_COLOR_SWAP_DURATION_MS = 600;

// Poids Rec.709 utilisés par la luminance perçue (même formule que le seuil de bloom de
// UnrealBloomPass, voir postprocessing.ts) — le vert pèse ~10x plus que le bleu, donc une même
// emissiveIntensity donne un rendu très inégal selon la teinte (vert/cyan éclatants, bleu/violet
// ternes) si on ne compense pas.
const LUMINANCE_WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 };
function relativeLuminance(color: THREE.Color): number {
  return color.r * LUMINANCE_WEIGHTS.r + color.g * LUMINANCE_WEIGHTS.g + color.b * LUMINANCE_WEIGHTS.b;
}

interface LightColorOption {
  color: THREE.Color;
  intensity: number;
}

// Blanc chaud par défaut de la scène (voir WARM_COLOR dans objects/scenes/office.ts, dupliqué ici
// plutôt que partagé pour ne pas faire dépendre interactions/ d'un module de scène, voir
// interactions/CLAUDE.md) à son intensité déjà calibrée (0.67, voir litWarm() dans office.ts) —
// sert de référence de luminance pour calibrer les autres teintes de la palette ci-dessous.
const BASE_LIGHT_COLOR = new THREE.Color(0xffdfb0);
const BASE_LIGHT_INTENSITY = 0.67;
const TARGET_LUMINANCE = relativeLuminance(BASE_LIGHT_COLOR) * BASE_LIGHT_INTENSITY;

// intensity calculée pour que chaque teinte retombe sur la même luminance perçue que le blanc
// chaud par défaut (TARGET_LUMINANCE) — sans ça, cycler dans la palette donne l'impression que
// certaines couleurs "n'allument" pas autant que d'autres.
function calibratedLightColor(hex: number): LightColorOption {
  const color = new THREE.Color(hex);
  return { color, intensity: TARGET_LUMINANCE / relativeLuminance(color) };
}

// Palette cyclique pour "swap_light_color" (Led_pannels) : base (blanc chaud) - rouge - vert -
// violet - rose - cyan.
const LIGHT_COLOR_PALETTE: LightColorOption[] = [
  { color: BASE_LIGHT_COLOR, intensity: BASE_LIGHT_INTENSITY },
  calibratedLightColor(0xff0000), // rouge
  calibratedLightColor(0x00ff00), // vert
  calibratedLightColor(0x8000ff), // violet
  calibratedLightColor(0xff1493), // rose
  calibratedLightColor(0x00ffff), // cyan
];

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Décale une position pour faire pivoter un objet autour d'un point externe (ex. sa base)
// plutôt qu'autour de sa propre origine (voir "pivotOffset" dans ObjectState) — sans ça,
// object.rotation pivote toujours autour de l'origine locale, ce qui donne un effet "balancier"
// centré au milieu de l'objet au lieu d'une vraie bascule/rotation depuis sa base.
function pivotedPositionOffset(pivotOffset: THREE.Vector3, axis: THREE.Vector3, angle: number, out: THREE.Vector3): THREE.Vector3 {
  out.copy(pivotOffset).negate().applyAxisAngle(axis, angle).add(pivotOffset);
  return out;
}

type OneShotKind = "swing" | "swing_back" | "spin" | "bounce" | "move";

interface OneShot {
  kind: OneShotKind;
  startTime: number;
  moveOffset?: THREE.Vector3;
  bounceHeight?: number;
}

interface ObjectState {
  restPosition: THREE.Vector3;
  restRotation: THREE.Euler;
  // Vecteur de l'origine de l'objet vers le centre de la base de sa bounding box, dans le même
  // repère que restPosition — utilisé par swing/swing_back/spin pour pivoter depuis la base
  // plutôt que depuis l'origine (voir pivotedPositionOffset). Calculé une fois, avant toute
  // animation (géométrie encore au repos). Suppose une chaîne de parents sans rotation/échelle
  // jusqu'à la racine de la scène (vrai ici, voir objects/scenes/office.ts).
  pivotOffset: THREE.Vector3;
  hovered: boolean;
  liftProgress: number;
  oneShot: OneShot | null;
}

interface ScreenGlowState {
  material: THREE.MeshStandardMaterial;
  baseEmissiveIntensity: number;
  baseEmissive: THREE.Color;
  hovered: boolean;
  progress: number;
}

// "swap" échange la position de deux enfants au hasard à chaque déclenchement, sur l'axe qui les
// distingue — contrairement aux autres one-shot, ne revient jamais au repos : le but est de
// rebattre durablement l'ordre, pas de jouer un mouvement temporaire (voir CLAUDE.md racine).
// Écrit sur position.z (pas .y) : l'export glTF convertit le Z-up de Blender en Y-up, ce qui
// remappe l'axe Y de Blender (l'axe le long duquel les enfants du Triptych sont espacés dans
// Blender) sur Z côté Three.js — confirmé ici, les enfants ont un Y identique et seul Z varie.
interface ChildSwap {
  child: THREE.Object3D;
  fromZ: number;
  toZ: number;
  startTime: number;
}

// "swap_light_color" (Led_pannels) fait tourner l'émissif + la PointLight associée (voir
// object.userData.emissiveLight, posé par litWarm() dans objects/scenes/office.ts) de tous les
// meshes descendants vers la couleur suivante de LIGHT_COLOR_PALETTE — comme "swap", ne revient
// jamais à l'état précédent : chaque clic avance d'un cran dans la palette.
interface LightColorSwap {
  material: THREE.MeshStandardMaterial;
  light: THREE.PointLight | null;
  fromColor: THREE.Color;
  toColor: THREE.Color;
  fromIntensity: number;
  toIntensity: number;
  startTime: number;
}

export interface ObjectAnimations {
  setHovered: (object: THREE.Object3D | null) => void;
  trigger: (object: THREE.Object3D, animationType: string | undefined) => void;
  update: () => void;
}

// Module unique pour toutes les animations locales déclenchées sur un objet interactif — voir
// CLAUDE.md racine "Interaction et caméra". Composer ici plutôt que d'avoir plusieurs modules
// écrire indépendamment sur object.position/rotation évite qu'ils s'écrasent (ex. le
// survol-lift et un "move" déclenché en même temps) : chaque objet a un unique ObjectState,
// tous ses offsets sont sommés avant d'être appliqués une fois par frame dans update().
export function createObjectAnimations(): ObjectAnimations {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const states = new WeakMap<THREE.Object3D, ObjectState>();
  const active = new Set<THREE.Object3D>();
  const screenGlows = new Map<THREE.Mesh, ScreenGlowState>();
  // Clé = l'enfant lui-même (pas l'objet interactif parent) : contrairement à ObjectState/active,
  // "swap" écrit directement sur les enfants, qui ne sont pas forcément eux-mêmes interactifs.
  const childSwaps = new Map<THREE.Object3D, ChildSwap>();
  // Index courant dans LIGHT_COLOR_PALETTE, par objet interactif (ex. Led_pannels) — pas par mesh,
  // puisque tous les descendants avancent ensemble d'un cran au même clic.
  const lightColorIndex = new WeakMap<THREE.Object3D, number>();
  const lightColorSwaps = new Map<THREE.MeshStandardMaterial, LightColorSwap>();
  let hoveredObject: THREE.Object3D | null = null;

  // Valeur Z actuelle d'un enfant, en tenant compte d'un swap déjà en cours pour lui (sinon sa
  // position au repos) — sert de point de départ si on le re-tire au sort avant la fin du
  // précédent échange, pour ne pas sauter brutalement depuis son ancienne cible.
  function currentSwapZ(child: THREE.Object3D): number {
    const existing = childSwaps.get(child);
    if (!existing) return child.position.z;
    const u = Math.min((performance.now() - existing.startTime) / SWAP_DURATION_MS, 1);
    return existing.fromZ + (existing.toZ - existing.fromZ) * easeInOutCubic(u);
  }

  function updateSwaps() {
    if (childSwaps.size === 0) return;
    for (const [child, swap] of childSwaps) {
      const u = Math.min((performance.now() - swap.startTime) / SWAP_DURATION_MS, 1);
      child.position.z = swap.fromZ + (swap.toZ - swap.fromZ) * easeInOutCubic(u);
      if (u >= 1) childSwaps.delete(child);
    }
  }

  // État actuel (couleur + intensité) d'un matériau déjà en transition (sinon son état émissif au
  // repos) — même rôle que currentSwapZ : point de départ propre si on re-clique avant la fin du
  // fondu précédent, plutôt que de sauter depuis l'ancienne cible.
  const tmpColor = new THREE.Color();
  function currentLightColorState(material: THREE.MeshStandardMaterial): LightColorOption {
    const existing = lightColorSwaps.get(material);
    if (!existing) return { color: material.emissive.clone(), intensity: material.emissiveIntensity };
    const u = Math.min((performance.now() - existing.startTime) / LIGHT_COLOR_SWAP_DURATION_MS, 1);
    const eased = easeInOutCubic(u);
    return {
      color: existing.fromColor.clone().lerp(existing.toColor, eased),
      intensity: existing.fromIntensity + (existing.toIntensity - existing.fromIntensity) * eased,
    };
  }

  function updateLightColorSwaps() {
    if (lightColorSwaps.size === 0) return;
    for (const [material, swap] of lightColorSwaps) {
      const u = Math.min((performance.now() - swap.startTime) / LIGHT_COLOR_SWAP_DURATION_MS, 1);
      const eased = easeInOutCubic(u);
      tmpColor.copy(swap.fromColor).lerp(swap.toColor, eased);
      material.emissive.copy(tmpColor);
      material.emissiveIntensity = swap.fromIntensity + (swap.toIntensity - swap.fromIntensity) * eased;
      if (swap.light) swap.light.color.copy(tmpColor);
      if (u >= 1) lightColorSwaps.delete(material);
    }
  }

  function getState(object: THREE.Object3D): ObjectState {
    let state = states.get(object);
    if (!state) {
      const box = new THREE.Box3().setFromObject(object);
      const worldCenter = box.getCenter(new THREE.Vector3());
      const worldPosition = new THREE.Vector3();
      object.getWorldPosition(worldPosition);
      state = {
        restPosition: object.position.clone(),
        restRotation: object.rotation.clone(),
        pivotOffset: new THREE.Vector3(worldCenter.x - worldPosition.x, box.min.y - worldPosition.y, worldCenter.z - worldPosition.z),
        hovered: false,
        liftProgress: 0,
        oneShot: null,
      };
      states.set(object, state);
    }
    return state;
  }

  // "screen" est posé sur un sous-objet (voir CLAUDE.md racine), pas sur l'objet interactif
  // racine — traverse() inclut l'objet lui-même, donc ça couvre aussi le cas où l'objet
  // interactif porte directement cette valeur.
  function findScreenMeshes(object: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.animationType === "screen") {
        meshes.push(child);
      }
    });
    return meshes;
  }

  // Couplé directement au survol (comme le lift), pas une timeline fixe indépendante — sans
  // ça, deux écrans survolés à quelques instants d'intervalle peuvent sembler allumés
  // simultanément (celui de l'objet précédent finit encore son propre cycle) alors qu'aucun
  // des deux n'est réellement survolé au même moment.
  function getScreenGlow(mesh: THREE.Mesh): ScreenGlowState | null {
    let state = screenGlows.get(mesh);
    if (state) return state;
    if (!(mesh.material instanceof THREE.MeshStandardMaterial)) {
      console.warn(`"${mesh.name}" a animationType="screen" mais son matériau n'a pas d'émissif (MeshStandardMaterial attendu) — effet ignoré.`);
      return null;
    }
    // Clone avant de toucher à quoi que ce soit : deux meshes "screen" différents peuvent
    // partager le même matériau côté Blender (mesh dupliqué sans "rendre le matériau unique",
    // déjà rencontré entre Mac_screen/iPad_screen et iPhone_screen/Apple_watch_screen) — sans
    // ce clone, animer l'émissif de l'un allumerait aussi tous ceux qui partagent la ressource.
    const material = mesh.material.clone();
    mesh.material = material;
    state = {
      material,
      baseEmissiveIntensity: material.emissiveIntensity,
      baseEmissive: material.emissive.clone(),
      hovered: false,
      progress: 0,
    };
    screenGlows.set(mesh, state);
    return state;
  }

  function setScreenHovered(object: THREE.Object3D, hovered: boolean) {
    for (const mesh of findScreenMeshes(object)) {
      const state = getScreenGlow(mesh);
      if (state) state.hovered = hovered;
    }
  }

  function updateScreenGlows() {
    if (screenGlows.size === 0) return;
    for (const state of screenGlows.values()) {
      const target = state.hovered ? 1 : 0;
      state.progress = reducedMotion ? target : state.progress + (target - state.progress) * SCREEN_GLOW_SPEED;
      if (Math.abs(target - state.progress) < 0.001) state.progress = target;
      state.material.emissiveIntensity = state.baseEmissiveIntensity + (SCREEN_EMISSIVE_INTENSITY - state.baseEmissiveIntensity) * state.progress;
      state.material.emissive.copy(state.baseEmissive).lerp(SCREEN_COLOR, state.progress);
    }
  }

  return {
    setHovered(object) {
      if (object === hoveredObject) return;
      if (hoveredObject) {
        const previous = getState(hoveredObject);
        previous.hovered = false;
        active.add(hoveredObject);
        setScreenHovered(hoveredObject, false);
      }
      hoveredObject = object;
      if (object) {
        const state = getState(object);
        state.hovered = true;
        active.add(object);
        setScreenHovered(object, true);
      }
    },
    trigger(object, animationType) {
      if (animationType === "swing" || animationType === "swing_back" || animationType === "spin") {
        if (reducedMotion) return;
        const state = getState(object);
        state.oneShot = { kind: animationType, startTime: performance.now() };
        active.add(object);
      } else if (animationType === "bounce") {
        if (reducedMotion) return;
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const state = getState(object);
        state.oneShot = { kind: "bounce", startTime: performance.now(), bounceHeight: size.y * BOUNCE_HEIGHT_FACTOR };
        active.add(object);
      } else if (animationType === "move") {
        if (reducedMotion) return;
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const footprint = Math.max(size.x, size.z);
        const angle = Math.random() * Math.PI * 2;
        const radius = footprint * (MOVE_RADIUS_FACTOR_MIN + Math.random() * (MOVE_RADIUS_FACTOR_MAX - MOVE_RADIUS_FACTOR_MIN));
        const state = getState(object);
        state.oneShot = {
          kind: "move",
          startTime: performance.now(),
          moveOffset: new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
        };
        active.add(object);
      } else if (animationType === "swap") {
        // Échange la position (axe Z, voir ChildSwap) de deux enfants directs tirés au hasard
        // (jamais les mêmes deux à chaque fois) — écrit sur childSwaps, pas sur ObjectState/active :
        // l'objet interactif lui-même (ex. Triptych) ne bouge pas, seuls ses enfants sont concernés.
        if (reducedMotion) return;
        const children = object.children;
        if (children.length < 2) return;
        const i = Math.floor(Math.random() * children.length);
        let j = Math.floor(Math.random() * (children.length - 1));
        if (j >= i) j += 1;
        const a = children[i];
        const b = children[j];
        const aZ = currentSwapZ(a);
        const bZ = currentSwapZ(b);
        const startTime = performance.now();
        childSwaps.set(a, { child: a, fromZ: aZ, toZ: bZ, startTime });
        childSwaps.set(b, { child: b, fromZ: bZ, toZ: aZ, startTime });
      } else if (animationType === "swap_light_color") {
        // Avance d'un cran dans la palette pour tous les descendants portant une lumière associée
        // (voir userData.emissiveLight, posé par litWarm() dans objects/scenes/office.ts) — un
        // clic change la couleur pour tout le groupe (ex. les 13 panneaux de Led_pannels), pas
        // panneau par panneau.
        const currentIndex = lightColorIndex.get(object) ?? 0;
        const nextIndex = (currentIndex + 1) % LIGHT_COLOR_PALETTE.length;
        lightColorIndex.set(object, nextIndex);
        const target = LIGHT_COLOR_PALETTE[nextIndex];
        const startTime = performance.now();
        object.traverse((child) => {
          if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
          const light = (child.userData.emissiveLight as THREE.PointLight | undefined) ?? null;
          const from = currentLightColorState(child.material);
          if (reducedMotion) {
            child.material.emissive.copy(target.color);
            child.material.emissiveIntensity = target.intensity;
            if (light) light.color.copy(target.color);
            return;
          }
          lightColorSwaps.set(child.material, {
            material: child.material,
            light,
            fromColor: from.color,
            toColor: target.color.clone(),
            fromIntensity: from.intensity,
            toIntensity: target.intensity,
            startTime,
          });
        });
      }
      // "screen" ne passe pas par ce trigger() one-shot : il est couplé directement au survol
      // (voir setHovered()/setScreenHovered() plus haut), pas déclenché au clic — un clic n'a
      // pas de moment naturel "fin de survol" pour l'éteindre à nouveau.
    },
    update() {
      updateScreenGlows();
      updateSwaps();
      updateLightColorSwaps();
      if (active.size === 0) return;

      const positionOffset = new THREE.Vector3();
      const pivotDelta = new THREE.Vector3();

      for (const object of active) {
        const state = states.get(object);
        if (!state) {
          active.delete(object);
          continue;
        }
        let stillActive = false;

        const liftTarget = state.hovered ? 1 : 0;
        state.liftProgress = reducedMotion ? liftTarget : state.liftProgress + (liftTarget - state.liftProgress) * LIFT_SPEED;
        if (Math.abs(liftTarget - state.liftProgress) < 0.001) state.liftProgress = liftTarget;
        if (state.liftProgress !== 0) stillActive = true;

        positionOffset.set(0, 0, 0);
        let rotOffsetX = 0;
        let rotOffsetY = 0;

        if (state.oneShot) {
          const elapsed = performance.now() - state.oneShot.startTime;
          if (state.oneShot.kind === "swing") {
            // Rotation autour de l'axe vertical (Y), pivot à la base (pas l'origine) : l'objet
            // "dit non" de gauche à droite sans que sa base ne se déplace. Amplitude en
            // ease-out (forte dès le départ, s'atténue) plutôt qu'un envelope symétrique.
            const u = Math.min(elapsed / SWING_DURATION_MS, 1);
            const decay = Math.pow(1 - u, 2);
            const angle = SWING_AMPLITUDE * decay * Math.sin(u * SWING_OSCILLATIONS * Math.PI * 2);
            rotOffsetY = angle;
            positionOffset.add(pivotedPositionOffset(state.pivotOffset, AXIS_Y, angle, pivotDelta));
            if (u < 1) stillActive = true;
            else state.oneShot = null;
          } else if (state.oneShot.kind === "swing_back") {
            // Bascule vers l'arrière puis retour, pivot à la base — un seul mouvement, pas
            // d'oscillation répétée (contrairement à "swing").
            const u = Math.min(elapsed / SWING_BACK_DURATION_MS, 1);
            const angle = SWING_BACK_AMPLITUDE * Math.sin(Math.PI * u);
            rotOffsetX = angle;
            positionOffset.add(pivotedPositionOffset(state.pivotOffset, AXIS_X, angle, pivotDelta));
            if (u < 1) stillActive = true;
            else state.oneShot = null;
          } else if (state.oneShot.kind === "spin") {
            // Tour complet à vitesse constante (linéaire, pas d'easing), pivot à la base.
            const u = Math.min(elapsed / SPIN_DURATION_MS, 1);
            const angle = u * Math.PI * 2;
            rotOffsetY = angle;
            positionOffset.add(pivotedPositionOffset(state.pivotOffset, AXIS_Y, angle, pivotDelta));
            if (u < 1) stillActive = true;
            else state.oneShot = null;
          } else if (state.oneShot.kind === "bounce" && state.oneShot.bounceHeight !== undefined) {
            // Rebonds décroissants (façon balle qui retombe) : amplitude en ease-out, la forme
            // du rebond vient d'un sinus redressé (toujours positif, revient à 0 à chaque impact).
            const u = Math.min(elapsed / BOUNCE_DURATION_MS, 1);
            const decay = Math.pow(1 - u, 1.6);
            const shape = Math.abs(Math.sin(u * BOUNCE_COUNT * Math.PI));
            positionOffset.y += state.oneShot.bounceHeight * decay * shape;
            if (u < 1) stillActive = true;
            else state.oneShot = null;
          } else if (state.oneShot.kind === "move" && state.oneShot.moveOffset) {
            const u = Math.min(elapsed / MOVE_DURATION_MS, 1);
            const phase = u < 0.5 ? easeInOutCubic(u * 2) : 1 - easeInOutCubic((u - 0.5) * 2);
            positionOffset.x += state.oneShot.moveOffset.x * phase;
            positionOffset.z += state.oneShot.moveOffset.z * phase;
            if (u < 1) stillActive = true;
            else state.oneShot = null;
          }
        }

        object.position.set(
          state.restPosition.x + positionOffset.x,
          state.restPosition.y + positionOffset.y + LIFT_AMOUNT * state.liftProgress,
          state.restPosition.z + positionOffset.z
        );
        object.rotation.set(state.restRotation.x + rotOffsetX, state.restRotation.y + rotOffsetY, state.restRotation.z);

        if (!stillActive) active.delete(object);
      }
    },
  };
}
