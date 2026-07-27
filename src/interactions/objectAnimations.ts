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

// "scale_interval" (effet "heartbeat") : deux pulsations dos-à-dos (échelle 1 -> 1.2 -> 1, deux
// fois), précédées d'un léger délai — utile surtout avec `loop=true` (voir OneShot.looping) pour
// laisser un temps de silence entre deux cycles consécutifs plutôt qu'un enchaînement continu
// sans respiration.
const SCALE_INTERVAL_DELAY_MS = 220;
const SCALE_INTERVAL_PULSE_DURATION_MS = 260;
const SCALE_INTERVAL_PULSE_COUNT = 2;
const SCALE_INTERVAL_PEAK_SCALE = 1.12;
const SCALE_INTERVAL_CYCLE_DURATION_MS = SCALE_INTERVAL_DELAY_MS + SCALE_INTERVAL_PULSE_COUNT * SCALE_INTERVAL_PULSE_DURATION_MS;

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

type OneShotKind = "swing" | "swing_back" | "spin" | "bounce" | "move" | "scale_interval";

interface OneShot {
  kind: OneShotKind;
  startTime: number;
  moveOffset?: THREE.Vector3;
  bounceHeight?: number;
  // Custom Property Blender "loop" (Boolean, indépendante d'animationType) : au lieu de s'arrêter
  // une fois son cycle terminé, ce oneShot recommence automatiquement depuis le début — jusqu'à
  // ce qu'un nouveau trigger() arrive pour cet objet (voir stopRequested). Capturé une fois au
  // déclenchement (object.userData.loop), pas relu ensuite.
  looping: boolean;
  // Posé par trigger() quand un nouveau déclenchement arrive alors qu'un cycle looping est déjà
  // en cours — termine le cycle courant proprement (pas de coupure nette en plein mouvement) puis
  // s'arrête au lieu de relancer, voir finishOneShotCycle().
  stopRequested: boolean;
}

interface ObjectState {
  restPosition: THREE.Vector3;
  restRotation: THREE.Euler;
  // Échelle de repos d'origine — utilisée uniquement par "scale_interval" (voir update()), qui
  // multiplie cette échelle par son facteur de pulsation plutôt que d'écrire une valeur absolue :
  // préserve une échelle non-uniforme éventuelle exportée depuis Blender.
  restScale: THREE.Vector3;
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

// "swap" échange la position de deux enfants ADJACENTS à chaque déclenchement, sur l'axe qui les
// distingue — contrairement aux autres one-shot, ne revient jamais au repos : le but est de
// rebattre durablement l'ordre, pas de jouer un mouvement temporaire (voir CLAUDE.md racine).
// Écrit sur position.z (pas .y) : l'export glTF convertit le Z-up de Blender en Y-up, ce qui
// remappe l'axe Y de Blender (l'axe le long duquel les enfants du Triptych sont espacés dans
// Blender) sur Z côté Three.js — confirmé ici, les enfants ont un Y identique et seul Z varie.
//
// Glissement en ligne droite (ease-in-out), pas d'effet supplémentaire (ni arc de contournement,
// ni rétrécissement/téléportation — les deux essayés puis retirés sur retour direct de
// l'utilisateur, voir CLAUDE.md racine) : les deux enfants échangés se croisent forcément à
// mi-trajet, ce qui est accepté tel quel. Ce qui n'est PAS accepté : avec 3+ enfants alignés
// (ex. Triptych_1/2/3), échanger les deux enfants aux EXTRÉMITÉS ferait glisser leur trajectoire
// tout droit à travers la position de l'enfant du MILIEU, immobile — un chevauchement à trois
// bien plus visible que le simple croisement entre les deux enfants échangés. D'où la paire
// choisie au hasard parmi les paires ADJACENTES seulement (voir trigger()) : son point de
// croisement est toujours un point vide entre les deux, jamais la position d'un troisième enfant.
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
  startTime: number;
}

// Renvoyé par trigger() pour que main.ts sache si un son ("sound", indépendant d'animationType —
// voir CLAUDE.md racine) doit accompagner ce déclenchement précis :
// - "started" : un nouveau cycle a réellement démarré (one-shot classique, première activation
//   d'un cycle "loop", ou tout autre animationType géré ici sans verrou — swap/swap_light_color/
//   non reconnu) — le son doit jouer.
// - "blocked" : verrou anti-re-déclenchement classique (cycle déjà en cours, pas en boucle) ou
//   prefers-reduced-motion — rien n'a changé, le son ne doit pas rejouer.
// - "stop-requested" : ce déclenchement a demandé l'arrêt d'un cycle "loop" en cours (voir
//   OneShot.stopRequested) — le son associé doit être coupé, pas rejoué.
export type TriggerOutcome = "started" | "blocked" | "stop-requested";

export interface ObjectAnimations {
  setHovered: (object: THREE.Object3D | null) => void;
  trigger: (object: THREE.Object3D, animationType: string | undefined) => TriggerOutcome;
  // Notifie `callback(object)` chaque fois qu'un cycle one-shot se termine POUR DE BON (pas une
  // simple relance de boucle, voir OneShot.looping/stopRequested) — main.ts s'en sert pour couper
  // un son ("sound") encore en cours exactement à ce moment-là, que ce soit un one-shot classique
  // qui dure plus longtemps que son animation, ou un cycle "loop" arrêté (une fois son dernier
  // passage terminé). Voir CLAUDE.md racine, "Son sur les animations".
  onOneShotEnd: (callback: (object: THREE.Object3D) => void) => void;
  // "animationClip" (voir objects/CLAUDE.md) : démarre/arrête un AnimationClip glTF embarqué
  // (ex. Aquarium, poissons/bulles) raciné sur `object`, couplé au cycle de vie du déclencheur
  // (survol ou clic, peu importe lequel — voir main.ts) comme "screen" pour le survol : actif
  // tant que la condition (survolé, ou zoomé pour un déclenchement au clic) l'est, pas un
  // one-shot. Indépendant d'animationType/trigger() ci-dessus.
  setClipActive: (object: THREE.Object3D, clip: THREE.AnimationClip, active: boolean) => void;
  // Renvoie si de la géométrie (position/rotation d'un objet ou d'un enfant "swap") a réellement
  // changé cette frame — pas les couleurs/intensités émissives ("screen"/"swap_light_color"), qui
  // n'affectent jamais une shadow map. main.ts s'en sert pour ne recalculer les ombres
  // (renderer.shadowMap.needsUpdate) que les frames où c'est nécessaire, voir CLAUDE.md racine.
  update: () => boolean;
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
  // Slot Z "logique" actuel de chaque enfant impliqué dans un "swap" — toujours une des valeurs
  // de repos d'origine du groupe. Sert à décider quelle valeur échanger, voir trigger()/"swap".
  const swapSlot = new WeakMap<THREE.Object3D, number>();
  // Index courant dans LIGHT_COLOR_PALETTE, par objet interactif (ex. Led_pannels) — pas par mesh,
  // puisque tous les descendants avancent ensemble d'un cran au même clic.
  const lightColorIndex = new WeakMap<THREE.Object3D, number>();
  const lightColorSwaps = new Map<THREE.MeshStandardMaterial, LightColorSwap>();
  // "animationClip" (Aquarium, etc.) : un mixer+action par objet, créés au premier
  // setClipActive() puis réutilisés ensuite (mis en pause plutôt que détruits/recréés à chaque
  // aller-retour, pour que la nage reprenne exactement où elle en était plutôt que de
  // recommencer à zéro à chaque survol/clic) — clé = l'objet racine du mixer (pas ses enfants
  // animés par les tracks du clip).
  interface ClipPlayback {
    mixer: THREE.AnimationMixer;
    action: THREE.AnimationAction;
  }
  const clipPlaybacks = new Map<THREE.Object3D, ClipPlayback>();
  let lastClipUpdateTime: number | null = null;
  let hoveredObject: THREE.Object3D | null = null;

  // Slot Z "logique" actuel d'un enfant — toujours une des valeurs de repos d'origine du groupe,
  // jamais une valeur visuelle interpolée (contrairement à child.position.z, qui peut être une
  // position intermédiaire pendant qu'un glissement est en cours — voir ChildSwap/updateSwaps()).
  // Capturé une seule fois au premier appel (avant qu'aucun swap n'ait eu lieu, donc
  // child.position.z est encore sa vraie position de repos), puis suivi uniquement via swapSlot
  // par la suite — sert aussi à trier les enfants par ordre spatial dans trigger()/"swap" pour
  // déterminer l'adjacence, voir plus bas.
  function getSwapSlot(child: THREE.Object3D): number {
    let slot = swapSlot.get(child);
    if (slot === undefined) {
      slot = child.position.z;
      swapSlot.set(child, slot);
    }
    return slot;
  }

  // Renvoie si un enfant a bougé cette frame — utilisé par update() pour ne marquer la shadow
  // map "dirty" (voir plus bas) que quand de la géométrie a réellement changé.
  function updateSwaps(): boolean {
    if (childSwaps.size === 0) return false;
    for (const [child, swap] of childSwaps) {
      const u = Math.min((performance.now() - swap.startTime) / SWAP_DURATION_MS, 1);
      child.position.z = swap.fromZ + (swap.toZ - swap.fromZ) * easeInOutCubic(u);
      if (u >= 1) childSwaps.delete(child);
    }
    return true;
  }

  // État actuel (couleur + intensité) d'un matériau déjà en transition (sinon son état émissif au
  // repos) — point de départ propre si on re-clique avant la fin du fondu précédent, plutôt que
  // de sauter depuis l'ancienne cible. Intensité toujours dérivée de
  // la couleur (voir updateLightColorSwaps()), jamais stockée/interpolée elle-même.
  const tmpColor = new THREE.Color();
  function currentLightColorState(material: THREE.MeshStandardMaterial): LightColorOption {
    const existing = lightColorSwaps.get(material);
    if (!existing) return { color: material.emissive.clone(), intensity: material.emissiveIntensity };
    const u = Math.min((performance.now() - existing.startTime) / LIGHT_COLOR_SWAP_DURATION_MS, 1);
    const color = existing.fromColor.clone().lerp(existing.toColor, easeInOutCubic(u));
    return { color, intensity: TARGET_LUMINANCE / relativeLuminance(color) };
  }

  function updateLightColorSwaps() {
    if (lightColorSwaps.size === 0) return;
    for (const [material, swap] of lightColorSwaps) {
      const u = Math.min((performance.now() - swap.startTime) / LIGHT_COLOR_SWAP_DURATION_MS, 1);
      const eased = easeInOutCubic(u);
      tmpColor.copy(swap.fromColor).lerp(swap.toColor, eased);
      material.emissive.copy(tmpColor);
      // Intensité recalculée à partir de la couleur INTERPOLÉE de cette frame, pas interpolée
      // linéairement en parallèle entre une intensité de départ et d'arrivée : chaque teinte de
      // la palette n'est calibrée (intensity × luminance-couleur = TARGET_LUMINANCE, voir
      // calibratedLightColor()) qu'à ses propres extrémités. Interpoler intensité et couleur
      // séparément fait diverger leur produit à mi-fondu (l'un monte pendant que l'autre
      // descend, sans jamais repasser exactement par la cible) — visible comme un halo qui
      // s'allume fort avant de retomber à l'intensité normale. Recalculer ainsi maintient la
      // luminance perçue ~constante sur tout le fondu, pas seulement aux deux bouts.
      material.emissiveIntensity = TARGET_LUMINANCE / relativeLuminance(tmpColor);
      if (swap.light) swap.light.color.copy(tmpColor);
      if (u >= 1) lightColorSwaps.delete(material);
    }
  }

  // Delta en secondes depuis le dernier appel (AnimationMixer.update() attend des secondes, pas
  // des millisecondes) — calculé ici plutôt qu'avec un THREE.Clock pour rester cohérent avec le
  // reste du fichier (performance.now() partout, pas de dépendance Three.js supplémentaire).
  // Renvoie si un mixer non désactivé a effectivement bougé sa géométrie cette frame (voir
  // updateSwaps() ci-dessus) — pas juste "y a-t-il un mixer", puisqu'un clip mis en pause
  // (setClipActive(..., false)) est gardé en mémoire (voir clipPlaybacks) sans plus rien animer.
  function updateClipMixers(): boolean {
    if (clipPlaybacks.size === 0) return false;
    const now = performance.now();
    const delta = lastClipUpdateTime === null ? 0 : (now - lastClipUpdateTime) / 1000;
    lastClipUpdateTime = now;
    let anyPlaying = false;
    // Mixer mis à jour même si son action est en pause (coût négligeable pour un seul clip) —
    // plus simple que de ne mettre à jour que les actifs, et ne change rien au résultat.
    for (const { mixer, action } of clipPlaybacks.values()) {
      mixer.update(delta);
      if (!action.paused) anyPlaying = true;
    }
    return anyPlaying;
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
        restScale: object.scale.clone(),
        pivotOffset: new THREE.Vector3(worldCenter.x - worldPosition.x, box.min.y - worldPosition.y, worldCenter.z - worldPosition.z),
        hovered: false,
        liftProgress: 0,
        oneShot: null,
      };
      states.set(object, state);
    }
    return state;
  }

  // Callbacks externes notifiées quand un cycle one-shot se termine POUR DE BON (pas une simple
  // relance de boucle) — voir onOneShotEnd() dans l'objet retourné. main.ts s'en sert pour couper
  // un son encore en cours à ce moment précis, que ce soit un one-shot classique qui dure plus
  // longtemps que son animation, ou un cycle "loop" arrêté (une fois son dernier passage terminé,
  // pas au moment du stopRequested — voir CLAUDE.md racine, "Son sur les animations").
  const oneShotEndListeners: Array<(object: THREE.Object3D) => void> = [];

  // Termine le cycle en cours d'un one-shot : le relance depuis le début si `looping` est actif
  // et qu'aucun arrêt n'a été demandé (voir OneShot.looping/stopRequested — Custom Property
  // Blender "loop"), sinon l'arrête pour de bon et notifie oneShotEndListeners. Partagé par
  // toutes les branches de kind dans update() ci-dessous plutôt que dupliqué : la même logique
  // de reprise/arrêt s'applique quel que soit le type d'animation.
  function finishOneShotCycle(object: THREE.Object3D, state: ObjectState): void {
    const oneShot = state.oneShot;
    if (!oneShot) return;
    if (oneShot.looping && !oneShot.stopRequested) {
      oneShot.startTime = performance.now();
    } else {
      state.oneShot = null;
      for (const listener of oneShotEndListeners) listener(object);
    }
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
    onOneShotEnd(callback) {
      oneShotEndListeners.push(callback);
    },
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
      const isOneShotType =
        animationType === "swing" ||
        animationType === "swing_back" ||
        animationType === "spin" ||
        animationType === "bounce" ||
        animationType === "move" ||
        animationType === "scale_interval";
      // Custom Property Blender "loop" (Boolean, indépendante d'animationType — voir CLAUDE.md
      // racine) : capturée une fois ici, au moment du déclenchement.
      const loop = object.userData.loop === true;
      if (isOneShotType) {
        if (reducedMotion) return "blocked";
        const existing = getState(object).oneShot;
        if (existing) {
          // Un cycle est déjà en cours pour cet objet :
          // - s'il boucle (loop=true), ce déclenchement demande l'arrêt "propre" — termine le
          //   cycle courant au lieu de le couper net, puis ne relance pas le suivant (voir
          //   finishOneShotCycle()) ;
          // - sinon, verrou anti-re-déclenchement classique : un re-trigger réinitialiserait
          //   startTime et ferait sauter l'objet instantanément à son état de repos avant de
          //   repartir (ex. Chair/"spin" : cliquer pendant la rotation la faisait sauter en
          //   arrière puis repartir) — on ignore simplement ce déclenchement.
          if (existing.looping) {
            existing.stopRequested = true;
            return "stop-requested";
          }
          return "blocked";
        }
      }

      if (animationType === "swing" || animationType === "swing_back" || animationType === "spin") {
        const state = getState(object);
        state.oneShot = { kind: animationType, startTime: performance.now(), looping: loop, stopRequested: false };
        active.add(object);
      } else if (animationType === "bounce") {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const state = getState(object);
        state.oneShot = { kind: "bounce", startTime: performance.now(), bounceHeight: size.y * BOUNCE_HEIGHT_FACTOR, looping: loop, stopRequested: false };
        active.add(object);
      } else if (animationType === "move") {
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
          looping: loop,
          stopRequested: false,
        };
        active.add(object);
      } else if (animationType === "scale_interval") {
        // "Heartbeat" : deux pulsations d'échelle dos-à-dos précédées d'un léger délai (voir
        // constantes SCALE_INTERVAL_*) — la forme exacte est calculée dans update(), rien à
        // précalculer ici (contrairement à "bounce"/"move", pas de géométrie/tirage aléatoire
        // impliqué).
        const state = getState(object);
        state.oneShot = { kind: "scale_interval", startTime: performance.now(), looping: loop, stopRequested: false };
        active.add(object);
      } else if (animationType === "swap") {
        // Échange la position (axe Z, voir ChildSwap) de deux enfants ADJACENTS le long de cet
        // axe — écrit sur childSwaps, pas sur ObjectState/active : l'objet interactif lui-même
        // (ex. Triptych) ne bouge pas, seuls ses enfants sont concernés.
        if (reducedMotion) return "blocked";
        const children = object.children;
        if (children.length < 2) return "blocked";
        // Verrou anti-re-déclenchement, comme swing/spin/bounce/move (voir plus haut) : tant
        // qu'un enfant de ce groupe est encore en plein glissement, un nouveau clic est ignoré
        // plutôt que de réassigner un enfant mi-parcours à une toute nouvelle paire/destination.
        // Sans ce garde-fou, des clics rapprochés produisaient deux symptômes en apparence
        // différents mais de même cause : un reclic sur la même paire pendant son glissement la
        // faisait repartir en sens inverse depuis sa position déjà bien avancée, donnant
        // l'impression d'un "petit mouvement qui s'arrête" (retour quasi immédiat vers le point
        // de départ) ; un reclic qui attrapait un enfant en cours de route pour l'envoyer vers un
        // tout autre enfant lui faisait retraverser une bonne partie de la rangée, recréant un
        // chevauchement avec un troisième enfant que la restriction aux paires adjacentes
        // (ci-dessous) ne suffit plus à éviter une fois plusieurs glissements enchaînés.
        if (children.some((child) => childSwaps.has(child))) return "blocked";
        // Trié par slot logique (pas par ordre des enfants dans le tableau, qui ne reflète pas
        // forcément leur ordre spatial) pour que "adjacent" veuille dire spatialement voisin sur
        // cet axe — voir le commentaire sur ChildSwap plus haut pour pourquoi ça compte (éviter
        // qu'une paire choisie traverse la position d'un enfant du milieu non concerné).
        const sorted = [...children].sort((x, y) => getSwapSlot(x) - getSwapSlot(y));
        const i = Math.floor(Math.random() * (sorted.length - 1));
        const a = sorted[i];
        const b = sorted[i + 1];

        // Échange les slots LOGIQUES (toujours une des valeurs de repos d'origine du groupe),
        // jamais une valeur visuelle interpolée — avec 3+ enfants (ex. Triptych_1..3), utiliser
        // la position visuelle courante d'un enfant comme cible pour un autre pouvait produire
        // une valeur qui n'était la position de repos d'aucun enfant, faisant atterrir deux
        // enfants sur la même position (chevauchement) ou un enfant sur une position orpheline.
        // Voir interactions/CLAUDE.md pour le détail.
        const aSlot = getSwapSlot(a);
        const bSlot = getSwapSlot(b);
        swapSlot.set(a, bSlot);
        swapSlot.set(b, aSlot);

        // fromZ = position de repos actuelle : garanti exact grâce au verrou ci-dessus (plus
        // aucun enfant du groupe n'est mi-parcours au moment où ce code s'exécute).
        const startTime = performance.now();
        childSwaps.set(a, { child: a, fromZ: a.position.z, toZ: bSlot, startTime });
        childSwaps.set(b, { child: b, fromZ: b.position.z, toZ: aSlot, startTime });
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
            startTime,
          });
        });
      }
      // "screen" ne passe pas par ce trigger() one-shot : il est couplé directement au survol
      // (voir setHovered()/setScreenHovered() plus haut), pas déclenché au clic — un clic n'a
      // pas de moment naturel "fin de survol" pour l'éteindre à nouveau.

      // Tout chemin qui arrive jusqu'ici a réellement fait quelque chose cette fois-ci : un
      // nouveau oneShot vient d'être créé, un "swap"/"swap_light_color" vient de s'exécuter, ou
      // animationType n'est pas reconnu ici (aucun état à gérer, donc rien à bloquer) — dans tous
      // ces cas, "started" (voir TriggerOutcome) : main.ts s'en sert pour savoir si le son
      // ("sound") associé doit jouer.
      return "started";
    },
    setClipActive(object, clip, isActive) {
      // Mouvement pur sans état "figé" pertinent (contrairement à "screen", qui peut sauter
      // directement à une intensité fixe) — désactivé entièrement sous prefers-reduced-motion,
      // comme swing/spin/bounce/move/swap.
      if (reducedMotion) return;
      let playback = clipPlaybacks.get(object);
      if (!playback) {
        const mixer = new THREE.AnimationMixer(object);
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
        action.paused = true;
        playback = { mixer, action };
        clipPlaybacks.set(object, playback);
      }
      // Pause/reprend plutôt que stop()/reset() : la nage reprend exactement où elle en était à
      // la prochaine activation, au lieu de recommencer à zéro à chaque survol/clic.
      playback.action.paused = !isActive;
    },
    update() {
      updateScreenGlows();
      const swapped = updateSwaps();
      updateLightColorSwaps();
      const clipsMoved = updateClipMixers();

      let objectsMoved = false;

      if (active.size > 0) {
        const positionOffset = new THREE.Vector3();
        const pivotDelta = new THREE.Vector3();

        for (const object of active) {
          const state = states.get(object);
          if (!state) {
            active.delete(object);
            continue;
          }

          // Comparé à sa valeur d'avant cette frame (pas juste "!== 0") : un objet hovered dont
          // le lift a fini de converger (ex. resté survolé plusieurs secondes) ne doit plus
          // déclencher position.set()/marquer la shadow map "dirty" chaque frame pour rien —
          // seule une VRAIE transition (montée/descente en cours) compte comme changement.
          const liftBefore = state.liftProgress;
          const liftTarget = state.hovered ? 1 : 0;
          state.liftProgress = reducedMotion ? liftTarget : state.liftProgress + (liftTarget - state.liftProgress) * LIFT_SPEED;
          if (Math.abs(liftTarget - state.liftProgress) < 0.001) state.liftProgress = liftTarget;
          const liftChanged = state.liftProgress !== liftBefore;

          positionOffset.set(0, 0, 0);
          let rotOffsetX = 0;
          let rotOffsetY = 0;
          let scaleFactor = 1;
          // Capturés avant le bloc ci-dessous (qui peut modifier/vider state.oneShot en cours de
          // route via finishOneShotCycle()) : un one-shot en cours change forcément la géométrie
          // cette frame, y compris sur sa toute dernière frame (celle qui le fait atterrir pile à
          // son état de repos) — `kind` reste le même avant/après un relance en boucle (voir
          // OneShot.looping), donc capturable une fois ici sans se soucier de cette mutation.
          const oneShotRunning = state.oneShot !== null;
          const oneShotKind = state.oneShot?.kind;

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
              if (u >= 1) finishOneShotCycle(object, state);
            } else if (state.oneShot.kind === "swing_back") {
              // Bascule vers l'arrière puis retour, pivot à la base — un seul mouvement, pas
              // d'oscillation répétée (contrairement à "swing").
              const u = Math.min(elapsed / SWING_BACK_DURATION_MS, 1);
              const angle = SWING_BACK_AMPLITUDE * Math.sin(Math.PI * u);
              rotOffsetX = angle;
              positionOffset.add(pivotedPositionOffset(state.pivotOffset, AXIS_X, angle, pivotDelta));
              if (u >= 1) finishOneShotCycle(object, state);
            } else if (state.oneShot.kind === "spin") {
              // Tour complet à vitesse constante (linéaire, pas d'easing), pivot à la base.
              const u = Math.min(elapsed / SPIN_DURATION_MS, 1);
              const angle = u * Math.PI * 2;
              rotOffsetY = angle;
              positionOffset.add(pivotedPositionOffset(state.pivotOffset, AXIS_Y, angle, pivotDelta));
              if (u >= 1) finishOneShotCycle(object, state);
            } else if (state.oneShot.kind === "bounce" && state.oneShot.bounceHeight !== undefined) {
              // Rebonds décroissants (façon balle qui retombe) : amplitude en ease-out, la forme
              // du rebond vient d'un sinus redressé (toujours positif, revient à 0 à chaque impact).
              const u = Math.min(elapsed / BOUNCE_DURATION_MS, 1);
              const decay = Math.pow(1 - u, 1.6);
              const shape = Math.abs(Math.sin(u * BOUNCE_COUNT * Math.PI));
              positionOffset.y += state.oneShot.bounceHeight * decay * shape;
              if (u >= 1) finishOneShotCycle(object, state);
            } else if (state.oneShot.kind === "move" && state.oneShot.moveOffset) {
              const u = Math.min(elapsed / MOVE_DURATION_MS, 1);
              const phase = u < 0.5 ? easeInOutCubic(u * 2) : 1 - easeInOutCubic((u - 0.5) * 2);
              positionOffset.x += state.oneShot.moveOffset.x * phase;
              positionOffset.z += state.oneShot.moveOffset.z * phase;
              if (u >= 1) finishOneShotCycle(object, state);
            } else if (state.oneShot.kind === "scale_interval") {
              // "Heartbeat" : rien avant SCALE_INTERVAL_DELAY_MS (silence, voir la constante),
              // puis SCALE_INTERVAL_PULSE_COUNT pulsations dos-à-dos, chacune un simple sinus
              // redressé une seule fois (0 -> 1 -> 0, jamais négatif) qui monte l'échelle jusqu'à
              // SCALE_INTERVAL_PEAK_SCALE puis revient — pas d'easing supplémentaire nécessaire,
              // le sinus fournit déjà une accélération/décélération douce aux deux bouts.
              const u = Math.min(elapsed / SCALE_INTERVAL_CYCLE_DURATION_MS, 1);
              if (elapsed >= SCALE_INTERVAL_DELAY_MS) {
                const pulseElapsed = elapsed - SCALE_INTERVAL_DELAY_MS;
                const pulseIndex = Math.floor(pulseElapsed / SCALE_INTERVAL_PULSE_DURATION_MS);
                if (pulseIndex < SCALE_INTERVAL_PULSE_COUNT) {
                  const withinPulse = (pulseElapsed % SCALE_INTERVAL_PULSE_DURATION_MS) / SCALE_INTERVAL_PULSE_DURATION_MS;
                  const shape = Math.sin(withinPulse * Math.PI);
                  scaleFactor = 1 + (SCALE_INTERVAL_PEAK_SCALE - 1) * shape;
                }
              }
              if (u >= 1) finishOneShotCycle(object, state);
            }
          }

          if (liftChanged || oneShotRunning) {
            object.position.set(
              state.restPosition.x + positionOffset.x,
              state.restPosition.y + positionOffset.y + LIFT_AMOUNT * state.liftProgress,
              state.restPosition.z + positionOffset.z
            );
            object.rotation.set(state.restRotation.x + rotOffsetX, state.restRotation.y + rotOffsetY, state.restRotation.z);
            // Seul "scale_interval" touche l'échelle — les autres kinds ne doivent jamais la
            // toucher, elle reste telle qu'exportée depuis Blender (potentiellement non-uniforme).
            if (oneShotKind === "scale_interval") object.scale.copy(state.restScale).multiplyScalar(scaleFactor);
            objectsMoved = true;
          }

          // Sûr de retirer même si `state.hovered` est encore true et le lift resté à sa cible
          // (1) : un futur passage hovered->non-hovered rajoute l'objet dans `active` lui-même
          // (voir setHovered() ci-dessus), pas besoin de le garder ici "au cas où" pendant qu'il
          // ne se passe plus rien.
          if (!liftChanged && !state.oneShot) active.delete(object);
        }
      }

      return swapped || clipsMoved || objectsMoved;
    },
  };
}
