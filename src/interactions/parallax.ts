import * as THREE from "three";

const MAX_OFFSET_X = 0.28;
const MAX_OFFSET_Y = 0.17;
const LERP_FACTOR = 0.06;

export interface ParallaxRig {
  setBase: (position: THREE.Vector3, target: THREE.Vector3) => void;
  setEnabled: (enabled: boolean) => void;
  update: () => void;
}

// Remplace la navigation caméra libre (plus d'OrbitControls, voir CLAUDE.md "Interaction et
// caméra") : un léger décalage de la caméra, opposé au déplacement de la souris, autour de la
// pose de repos de la scène — donne une sensation de profondeur sans jamais permettre de
// vraiment tourner/incliner la vue. Suspendu pendant un zoom (main.ts désactive via
// setEnabled(false) avant cameraRig.focus(), réactive après cameraRig.reset()) et neutralisé
// si prefers-reduced-motion.
export function createParallaxRig(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement): ParallaxRig {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const basePosition = new THREE.Vector3();
  const baseTarget = new THREE.Vector3();
  let baseRight = new THREE.Vector3(1, 0, 0);
  let baseUp = new THREE.Vector3(0, 1, 0);
  let enabled = true;
  let pointerX = 0;
  let pointerY = 0;
  let offsetX = 0;
  let offsetY = 0;

  function handlePointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  }

  canvas.addEventListener("pointermove", handlePointerMove);

  return {
    setBase(position, target) {
      basePosition.copy(position);
      baseTarget.copy(target);
      const forward = target.clone().sub(position).normalize();
      baseRight = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      baseUp = new THREE.Vector3().crossVectors(baseRight, forward).normalize();
      offsetX = 0;
      offsetY = 0;
      camera.position.copy(basePosition);
      camera.lookAt(baseTarget);
    },
    setEnabled(value) {
      enabled = value;
      // Repart de zéro décalage à chaque réactivation (ex. retour d'un zoom, où la caméra est
      // revenue exactement sur basePosition) — évite un saut visuel vers un décalage figé
      // datant d'avant le zoom, la parallaxe re-dérive ensuite naturellement vers la souris.
      if (value) {
        offsetX = 0;
        offsetY = 0;
      }
    },
    update() {
      if (!enabled) return;
      if (reducedMotion) {
        camera.position.copy(basePosition);
        camera.lookAt(baseTarget);
        return;
      }

      const targetOffsetX = -pointerX * MAX_OFFSET_X;
      const targetOffsetY = -pointerY * MAX_OFFSET_Y;
      offsetX += (targetOffsetX - offsetX) * LERP_FACTOR;
      offsetY += (targetOffsetY - offsetY) * LERP_FACTOR;

      camera.position.copy(basePosition).addScaledVector(baseRight, offsetX).addScaledVector(baseUp, offsetY);
      camera.lookAt(baseTarget);
    },
  };
}
