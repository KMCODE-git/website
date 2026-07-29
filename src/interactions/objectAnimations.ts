import * as THREE from "three";
import { easeInOutCubic } from "./animations/easing";
import { createScreenGlowSystem } from "./animations/screenGlow";
import { createLampGlowSystem } from "./animations/lampGlow";
import { createChildSwapSystem } from "./animations/childSwap";
import { createLightColorSwapSystem } from "./animations/lightColorSwap";
import { createClipPlaybackSystem } from "./animations/clipPlayback";

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

// "scale_interval" (effet "heartbeat") : deux pulsations dos-à-dos (échelle 1 -> 1.2 -> 1, deux
// fois), précédées d'un léger délai — utile surtout avec `loop=true` (voir OneShot.looping) pour
// laisser un temps de silence entre deux cycles consécutifs plutôt qu'un enchaînement continu
// sans respiration.
const SCALE_INTERVAL_DELAY_MS = 220;
const SCALE_INTERVAL_PULSE_DURATION_MS = 260;
const SCALE_INTERVAL_PULSE_COUNT = 2;
const SCALE_INTERVAL_PEAK_SCALE = 1.12;
const SCALE_INTERVAL_CYCLE_DURATION_MS = SCALE_INTERVAL_DELAY_MS + SCALE_INTERVAL_PULSE_COUNT * SCALE_INTERVAL_PULSE_DURATION_MS;

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

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
  // "animationClip" (voir animations/clipPlayback.ts) : démarre/arrête un AnimationClip glTF
  // embarqué (ex. Aquarium, poissons/bulles) raciné sur `object`, couplé au cycle de vie du
  // déclencheur (survol ou clic, peu importe lequel — voir main.ts) comme "screen" pour le
  // survol : actif tant que la condition (survolé, ou zoomé pour un déclenchement au clic) l'est,
  // pas un one-shot. Indépendant d'animationType/trigger() ci-dessus.
  setClipActive: (object: THREE.Object3D, clip: THREE.AnimationClip, active: boolean) => void;
  // "lamp_toggle" (ex. Lamp) : progression (0..1, lissée) de la dernière lampe basculée — main.ts
  // la lit chaque frame pour assombrir l'éclairage ambiant global (lighting.ts, que ce module ne
  // connaît pas) en synchro avec le fondu de l'ampoule. Voir CLAUDE.md racine, "Lampe".
  getLampGlowProgress: () => number;
  // Renvoie si de la géométrie (position/rotation d'un objet ou d'un enfant "swap") a réellement
  // changé cette frame — pas les couleurs/intensités émissives ("screen"/"swap_light_color"/
  // "lamp_toggle"), qui n'affectent jamais une shadow map. main.ts s'en sert pour ne recalculer
  // les ombres (renderer.shadowMap.needsUpdate) que les frames où c'est nécessaire, voir
  // CLAUDE.md racine.
  update: () => boolean;
}

// Cœur de toutes les animations locales déclenchées sur un objet interactif — voir CLAUDE.md
// racine "Interaction et caméra". Composer ici (survol-lift + one-shot swing/spin/bounce/move/
// scale_interval) plutôt que d'avoir plusieurs modules écrire indépendamment sur
// object.position/rotation évite qu'ils s'écrasent (ex. le survol-lift et un "move" déclenché en
// même temps) : chaque objet a un unique ObjectState, tous ses offsets sont sommés avant d'être
// appliqués une fois par frame dans update().
//
// Les animations qui n'écrivent JAMAIS sur position/rotation/scale de l'objet interactif
// lui-même (screen, lamp_toggle, swap, swap_light_color, animationClip) n'ont pas besoin de
// composer avec ce cœur — elles vivent chacune dans leur propre sous-système sous
// interactions/animations/, avec leur propre état privé, et sont simplement orchestrées d'ici
// (délégation directe dans trigger()/update()/setHovered() ci-dessous).
export function createObjectAnimations(): ObjectAnimations {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const screenGlow = createScreenGlowSystem(reducedMotion);
  const lampGlow = createLampGlowSystem(reducedMotion);
  const childSwap = createChildSwapSystem(reducedMotion);
  const lightColorSwap = createLightColorSwapSystem(reducedMotion);
  const clipPlayback = createClipPlaybackSystem(reducedMotion);

  const states = new WeakMap<THREE.Object3D, ObjectState>();
  const active = new Set<THREE.Object3D>();
  let hoveredObject: THREE.Object3D | null = null;

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

  return {
    onOneShotEnd(callback) {
      oneShotEndListeners.push(callback);
    },
    getLampGlowProgress: () => lampGlow.getProgress(),
    setHovered(object) {
      if (object === hoveredObject) return;
      if (hoveredObject) {
        const previous = getState(hoveredObject);
        previous.hovered = false;
        active.add(hoveredObject);
        screenGlow.setHovered(hoveredObject, false);
      }
      hoveredObject = object;
      if (object) {
        const state = getState(object);
        state.hovered = true;
        active.add(object);
        screenGlow.setHovered(object, true);
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
        if (!childSwap.trigger(object)) return "blocked";
      } else if (animationType === "swap_light_color") {
        lightColorSwap.trigger(object);
      } else if (animationType === "lamp_toggle") {
        if (!lampGlow.trigger(object)) return "blocked";
        // Petit mouvement de balancier à chaque bascule, réutilisant tel quel "swing" (rotation
        // autour de la base, voir plus bas) — pas de nouvelle animation à écrire, même
        // amplitude/durée que n'importe quel autre objet "swing". "lamp_toggle" ne passe pas par
        // le verrou anti-re-déclenchement générique (isOneShotType plus haut, réservé aux
        // animationType qui n'ont QUE cet effet) puisque le toggle lumineux ci-dessus doit rester
        // possible à tout moment — le verrou est donc réappliqué ici, localement, pour le seul
        // mouvement de balancier : un reclic pendant qu'il tourne encore ne relance pas le
        // mouvement (éviterait de le faire sauter en arrière), mais bascule quand même la lumière.
        if (!reducedMotion) {
          const swingState = getState(object);
          if (!swingState.oneShot) {
            swingState.oneShot = { kind: "swing", startTime: performance.now(), looping: false, stopRequested: false };
            active.add(object);
          }
        }
      }
      // "screen" ne passe pas par ce trigger() one-shot : il est couplé directement au survol
      // (voir setHovered()/screenGlow.setHovered() plus haut), pas déclenché au clic — un clic
      // n'a pas de moment naturel "fin de survol" pour l'éteindre à nouveau.

      // Tout chemin qui arrive jusqu'ici a réellement fait quelque chose cette fois-ci : un
      // nouveau oneShot vient d'être créé, un "swap"/"swap_light_color" vient de s'exécuter, ou
      // animationType n'est pas reconnu ici (aucun état à gérer, donc rien à bloquer) — dans tous
      // ces cas, "started" (voir TriggerOutcome) : main.ts s'en sert pour savoir si le son
      // ("sound") associé doit jouer.
      return "started";
    },
    setClipActive: clipPlayback.setActive,
    update() {
      screenGlow.update();
      lampGlow.update();
      const swapped = childSwap.update();
      lightColorSwap.update();
      const clipsMoved = clipPlayback.update();

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
              // Mouvement de balancier depuis la base, comme si l'objet tanguait : rotation
              // autour de l'axe horizontal X (tangage, avant/arrière), pas l'axe vertical Y
              // (lacet, "dit non" de gauche à droite) — retour explicite de l'utilisateur, l'axe
              // vertical ne correspondait pas à l'effet recherché. Pivot à la base (pas
              // l'origine) pour que la base ne bouge pas pendant que le haut oscille. Amplitude
              // en ease-out (forte dès le départ, s'atténue) plutôt qu'une enveloppe symétrique.
              const u = Math.min(elapsed / SWING_DURATION_MS, 1);
              const decay = Math.pow(1 - u, 2);
              const angle = SWING_AMPLITUDE * decay * Math.sin(u * SWING_OSCILLATIONS * Math.PI * 2);
              rotOffsetX = angle;
              positionOffset.add(pivotedPositionOffset(state.pivotOffset, AXIS_X, angle, pivotDelta));
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
              // Compense le décalage entre l'origine locale de l'objet et sa base visuelle
              // (state.pivotOffset, déjà calculé pour swing/spin — voir ObjectState/getState()) :
              // sans ça, l'échelle grandit/rétrécit autour de l'origine LOCALE de l'objet, qui
              // n'est pas forcément à sa base visuelle (ex. AirpodsMax, dont l'origine Blender
              // n'est pas à sa base) — chaque pulsation le faisait alors "sauter" verticalement
              // au lieu de grossir sur place (bug corrigé, pas un problème d'axe à proprement
              // parler : object.scale multiplie toujours les positions locales des sommets par
              // rapport à l'origine (0,0,0) de l'objet, jamais par rapport à sa base visuelle).
              positionOffset.x += state.pivotOffset.x * (1 - scaleFactor);
              positionOffset.y += state.pivotOffset.y * (1 - scaleFactor);
              positionOffset.z += state.pivotOffset.z * (1 - scaleFactor);
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
