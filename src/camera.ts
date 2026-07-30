import * as THREE from "three";

const BASE_FOV = 45;
// En mode portrait (aspect < 1), le FOV vertical fixe à BASE_FOV donne un FOV horizontal
// nettement plus étroit (fovHorizontal = 2*atan(tan(fovVertical/2)*aspect)) — la scène (calibrée
// pour un écran large) paraît alors bien plus "zoomée" sur téléphone, signalé directement par
// l'utilisateur. Élargit le FOV vertical jusqu'à PORTRAIT_MAX_FOV à mesure que l'aspect rétrécit,
// pour montrer davantage de la scène — plafonné pour ne pas non plus déformer excessivement
// (effet fisheye) sur les aspects les plus étroits.
const PORTRAIT_MAX_FOV = 62;
// En dessous de cet aspect, le FOV reste plafonné à PORTRAIT_MAX_FOV plutôt que de continuer à
// grandir indéfiniment (~0.46 pour un iPhone en portrait plein écran).
const PORTRAIT_ASPECT_FLOOR = 0.5;

function computeFov(aspect: number): number {
  if (aspect >= 1) return BASE_FOV;
  const clampedAspect = Math.max(aspect, PORTRAIT_ASPECT_FLOOR);
  // Interpolation linéaire : aspect=1 -> BASE_FOV, aspect=PORTRAIT_ASPECT_FLOOR -> PORTRAIT_MAX_FOV.
  const t = (1 - clampedAspect) / (1 - PORTRAIT_ASPECT_FLOOR);
  return BASE_FOV + (PORTRAIT_MAX_FOV - BASE_FOV) * t;
}

export function createCamera(): THREE.PerspectiveCamera {
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(computeFov(aspect), aspect, 0.1, 100);
  camera.position.set(0, 3.2, 5.5);
  return camera;
}

export function handleCameraResize(camera: THREE.PerspectiveCamera): void {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.fov = computeFov(aspect);
  camera.updateProjectionMatrix();
}
