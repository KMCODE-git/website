import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { setPanBounds, UNBOUNDED_PAN_BOUNDS } from "../controls";
import type { CameraFocus, PanBounds } from "../data/scenes";

const TWEEN_DURATION_MS = 900;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export interface CameraRig {
  focus: (focus: CameraFocus, onComplete?: () => void) => void;
  reset: (onComplete?: () => void) => void;
}

export function createCameraRig(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls
): CameraRig {
  let rafId: number | null = null;
  let preFocusState: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  let savedDistance: { min: number; max: number } | null = null;
  let savedPanBounds: PanBounds | null = null;

  function cancelTween() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function tweenTo(destPosition: THREE.Vector3, destTarget: THREE.Vector3, onComplete?: () => void) {
    cancelTween();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      camera.position.copy(destPosition);
      controls.target.copy(destTarget);
      controls.update();
      onComplete?.();
      return;
    }

    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const startTime = performance.now();

    function step(now: number) {
      const t = Math.min((now - startTime) / TWEEN_DURATION_MS, 1);
      const eased = easeInOutCubic(t);
      camera.position.lerpVectors(startPosition, destPosition, eased);
      controls.target.lerpVectors(startTarget, destTarget, eased);
      controls.update();

      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        rafId = null;
        onComplete?.();
      }
    }

    rafId = requestAnimationFrame(step);
  }

  return {
    focus(focus, onComplete) {
      if (!preFocusState) {
        preFocusState = { position: camera.position.clone(), target: controls.target.clone() };
        // controls.enabled = false n'empêche pas OrbitControls.update() de continuer à
        // clamper minDistance/maxDistance (ça ne désactive que les écouteurs d'input) —
        // sans ça, un focus plus proche que la distance min de la scène serait ignoré.
        savedDistance = { min: controls.minDistance, max: controls.maxDistance };
        controls.minDistance = 0;
        controls.maxDistance = Infinity;
        // Même piège pour les panBounds (voir controls.ts) : le clamp de pan réagit à tout
        // event "change", y compris ceux du tween ci-dessous — un objet hors des panBounds
        // de la scène (ex. sur une étagère) verrait sa cible tirée de force à l'intérieur.
        savedPanBounds = setPanBounds(UNBOUNDED_PAN_BOUNDS);
      }
      controls.enabled = false;
      tweenTo(new THREE.Vector3(...focus.position), new THREE.Vector3(...focus.target), onComplete);
    },
    reset(onComplete) {
      if (!preFocusState) return;
      const { position, target } = preFocusState;
      preFocusState = null;
      tweenTo(position, target, () => {
        if (savedDistance) {
          controls.minDistance = savedDistance.min;
          controls.maxDistance = savedDistance.max;
          savedDistance = null;
        }
        if (savedPanBounds) {
          setPanBounds(savedPanBounds);
          savedPanBounds = null;
        }
        controls.enabled = true;
        onComplete?.();
      });
    },
  };
}
