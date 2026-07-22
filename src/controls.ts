import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SceneMeta, PanBounds, DistanceRange, AngleRange } from "./data/scenes";

// Valeurs de repli pour une scène qui ne précise pas ses propres bornes —
// suffisamment larges/permissives pour ne jamais paraître cassées par défaut.
const DEFAULT_DISTANCE: DistanceRange = { min: 1, max: 12 };
const DEFAULT_PAN_BOUNDS: PanBounds = { minX: -20, maxX: 20, minY: 0.1, maxY: 20, minZ: -20, maxZ: 20 };
const DEFAULT_POLAR_ANGLE: AngleRange = { min: 0.1, max: Math.PI - 0.1 };
const DEFAULT_AZIMUTH_ANGLE: AngleRange = { min: -Infinity, max: Infinity };

// Une seule instance d'OrbitControls vit pour toute la durée de l'app (voir main.ts) ;
// les bornes de pan actives sont reconfigurées à chaud par applyCameraConfig() à chaque
// changement de scène plutôt que de recréer les controls.
let activePanBounds: PanBounds = DEFAULT_PAN_BOUNDS;

// Utilisé par cameraRig.ts pendant un tween de focus : le clamp de pan ci-dessous réagit à
// tout event "change" (voir plus bas), y compris ceux déclenchés par le tween lui-même —
// controls.enabled = false ne le désactive pas (ça ne coupe que les écouteurs d'input, même
// piège déjà rencontré avec minDistance/maxDistance). Un objet cliquable situé hors des
// panBounds de la scène (ex. posé sur une étagère plutôt que sur le bureau) verrait sinon sa
// cible de focus tirée de force à l'intérieur des bornes en cours de route.
export const UNBOUNDED_PAN_BOUNDS: PanBounds = {
  minX: -Infinity,
  maxX: Infinity,
  minY: -Infinity,
  maxY: Infinity,
  minZ: -Infinity,
  maxZ: Infinity,
};

export function setPanBounds(bounds: PanBounds): PanBounds {
  const previous = activePanBounds;
  activePanBounds = bounds;
  return previous;
}

export function createControls(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement
): OrbitControls {
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = true;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // OrbitControls ne borne pas le pan nativement : on corrige la cible après coup,
  // en translatant la caméra du même delta pour ne pas casser la distance/l'angle en cours.
  controls.addEventListener("change", () => {
    const clampedX = THREE.MathUtils.clamp(controls.target.x, activePanBounds.minX, activePanBounds.maxX);
    const clampedY = THREE.MathUtils.clamp(controls.target.y, activePanBounds.minY, activePanBounds.maxY);
    const clampedZ = THREE.MathUtils.clamp(controls.target.z, activePanBounds.minZ, activePanBounds.maxZ);

    const dx = clampedX - controls.target.x;
    const dy = clampedY - controls.target.y;
    const dz = clampedZ - controls.target.z;

    if (dx !== 0 || dy !== 0 || dz !== 0) {
      controls.target.set(clampedX, clampedY, clampedZ);
      camera.position.x += dx;
      camera.position.y += dy;
      camera.position.z += dz;
    }
  });

  return controls;
}

export function applyCameraConfig(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  meta: SceneMeta
): void {
  camera.position.set(...meta.defaultCamera.position);
  controls.target.set(...meta.defaultCamera.target);

  const distance = meta.distance ?? DEFAULT_DISTANCE;
  controls.minDistance = distance.min;
  controls.maxDistance = distance.max;

  const polar = meta.polarAngle ?? DEFAULT_POLAR_ANGLE;
  controls.minPolarAngle = polar.min;
  controls.maxPolarAngle = polar.max;

  const azimuth = meta.azimuthAngle ?? DEFAULT_AZIMUTH_ANGLE;
  controls.minAzimuthAngle = azimuth.min;
  controls.maxAzimuthAngle = azimuth.max;

  activePanBounds = meta.panBounds ?? DEFAULT_PAN_BOUNDS;

  controls.update();
}
