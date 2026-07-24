import * as THREE from "three";
import type { CameraFocus } from "../data/scenes";

const TWEEN_DURATION_MS = 900;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export interface CameraRig {
  setCurrentTarget: (target: THREE.Vector3) => void;
  focus: (focus: CameraFocus, onComplete?: () => void) => void;
  reset: (base: CameraFocus, onComplete?: () => void) => void;
}

// Anime uniquement (voir interactions/CLAUDE.md) : reçoit un CameraFocus brut et tween la
// caméra vers lui. N'a plus aucune dépendance à OrbitControls (retiré du projet, voir
// interactions/parallax.ts pour ce qui gère la caméra hors zoom) — donc plus besoin de
// relâcher des bornes minDistance/maxDistance/panBounds pendant le tween, toute cette classe
// de bug a disparu avec OrbitControls.
export function createCameraRig(camera: THREE.PerspectiveCamera): CameraRig {
  let rafId: number | null = null;
  const currentTarget = new THREE.Vector3();

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
      currentTarget.copy(destTarget);
      camera.lookAt(destTarget);
      onComplete?.();
      return;
    }

    const startPosition = camera.position.clone();
    const startTarget = currentTarget.clone();
    const startTime = performance.now();

    function step(now: number) {
      const t = Math.min((now - startTime) / TWEEN_DURATION_MS, 1);
      const eased = easeInOutCubic(t);
      camera.position.lerpVectors(startPosition, destPosition, eased);
      currentTarget.lerpVectors(startTarget, destTarget, eased);
      camera.lookAt(currentTarget);

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
    setCurrentTarget(target) {
      currentTarget.copy(target);
    },
    focus(focus, onComplete) {
      tweenTo(new THREE.Vector3(...focus.position), new THREE.Vector3(...focus.target), onComplete);
    },
    reset(base, onComplete) {
      tweenTo(new THREE.Vector3(...base.position), new THREE.Vector3(...base.target), onComplete);
    },
  };
}
