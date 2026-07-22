import * as THREE from "three";
import type { CameraFocus } from "../data/scenes";

const DEFAULT_FILL_FRACTION = 0.75;

// Calcule une position/cible de caméra qui cadre l'objet pour qu'il occupe ~75% du cadre
// vertical, à partir de sa géométrie réelle (Box3) — évite de calibrer chaque focus à la
// main par essais-erreurs. Approche depuis "approachFrom" (typiquement la position de la
// caméra par défaut de la scène) : raisonnable pour un objet posé sur un bureau visible
// depuis la vue par défaut, moins fiable pour un objet à l'orientation atypique — dans ce
// cas, préciser `focus` à la main dans data/scenes.ts plutôt que de forcer l'automatique.
export function computeAutoFocus(
  object: THREE.Object3D,
  cameraFovDegrees: number,
  approachFrom: THREE.Vector3,
  fillFraction: number = DEFAULT_FILL_FRACTION
): CameraFocus {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(size.x, size.y, size.z);

  const halfFovRad = THREE.MathUtils.degToRad(cameraFovDegrees / 2);
  const distance = height / (2 * fillFraction * Math.tan(halfFovRad));

  const direction = approachFrom.clone().sub(center);
  if (direction.lengthSq() === 0) direction.set(0, 0, 1);
  direction.normalize();

  const position = center.clone().addScaledVector(direction, distance);

  return {
    position: position.toArray() as [number, number, number],
    target: center.toArray() as [number, number, number],
  };
}
