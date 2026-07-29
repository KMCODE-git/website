import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// Dégradé partagé avec html/body/.loading (voir style.css — CSS pur ne peut pas
// importer ces constantes, les deux teintes ci-dessous doivent rester synchronisées à la main si
// elles changent) — sans ça, flash visible au premier paint / à la disparition de l'écran de
// chargement, avant que scene.background (ce module) ne prenne le relais.
const GRADIENT_TOP = new THREE.Color(0x946D35);
const GRADIENT_BOTTOM = new THREE.Color(0xDEC5A4);
// Vers quoi le dégradé tend quand la lampe s'allume (voir setBackgroundDarkness(), appelée
// depuis main.ts en synchro avec objectAnimations.getLampGlowProgress()) — juste plus sombre que
// l'état normal (facteur constant, même teinte conservée), pas vers du noir : un premier essai
// assombrissait beaucoup trop (quasi noir), retiré sur retour direct.
const GRADIENT_DARK_FACTOR = 0.10;
const GRADIENT_TOP_DARK = GRADIENT_TOP.clone().multiplyScalar(GRADIENT_DARK_FACTOR);
const GRADIENT_BOTTOM_DARK = GRADIENT_BOTTOM.clone().multiplyScalar(GRADIENT_DARK_FACTOR);

const GRADIENT_HEIGHT = 256;

// Un seul CanvasTexture réutilisé (redessiné + `needsUpdate = true`) plutôt qu'une nouvelle
// texture créée à chaque appel de setBackgroundDarkness() — coût de dessin/upload minime, mais
// pas la peine de réallouer un canvas/une texture à chaque bascule de la lampe.
const gradientCanvas = document.createElement("canvas");
gradientCanvas.width = 1;
gradientCanvas.height = GRADIENT_HEIGHT;
const gradientCtx = gradientCanvas.getContext("2d")!;
const gradientTexture = new THREE.CanvasTexture(gradientCanvas);
gradientTexture.colorSpace = THREE.SRGBColorSpace;

const tmpTop = new THREE.Color();
const tmpBottom = new THREE.Color();

// Redessine le dégradé vertical (beige foncé en haut → clair en bas) en fonction de `darkness`
// (0 = état normal, 1 = complètement assombri) — appelée uniquement quand la valeur change
// réellement (voir main.ts), pas à chaque frame : un CanvasTexture regénéré en continu pour rien
// serait un coût GPU inutile, même principe que renderer.shadowMap.needsUpdate à la demande.
export function setBackgroundDarkness(darkness: number): void {
  tmpTop.copy(GRADIENT_TOP).lerp(GRADIENT_TOP_DARK, darkness);
  tmpBottom.copy(GRADIENT_BOTTOM).lerp(GRADIENT_BOTTOM_DARK, darkness);
  const gradient = gradientCtx.createLinearGradient(0, 0, 0, GRADIENT_HEIGHT);
  gradient.addColorStop(0, `#${tmpTop.getHexString()}`);
  gradient.addColorStop(1, `#${tmpBottom.getHexString()}`);
  gradientCtx.fillStyle = gradient;
  gradientCtx.fillRect(0, 0, 1, GRADIENT_HEIGHT);
  gradientTexture.needsUpdate = true;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  setBackgroundDarkness(0);
  scene.background = gradientTexture;
  return scene;
}

// scene.environment (PMREM depuis RoomEnvironment) — donne à tous les matériaux PBR une lumière
// ambiante/de réflexion indirecte, comme le fait le studio HDRI par défaut du viewport Blender
// (Material Preview) : sans ça, seules les deux lumières explicites (lighting.ts) éclairent quoi
// que ce soit, et toute face qui ne les regarde pas directement reste plate/sombre — écart de
// luminosité constaté entre Blender (viewport avec studio HDRI) et le rendu Three.js (2 lumières
// seulement, aucune contribution ambiante/de reflet). Généré une seule fois au démarrage (coût
// nul en continu), DÉCOUPLÉ de scene.background (qui reste le dégradé — les deux propriétés sont
// indépendantes en Three.js) : contrairement à un essai précédent où la même texture avait été
// utilisée comme scene.background (retiré, rendait le fond "trop intense"/délavé), ici on ne veut
// QUE l'apport lumineux sur les matériaux, pas un fond visible.
// Intensité globale de scene.environment (Three.js ≥ r160, THREE.Scene.environmentIntensity,
// défaut 1) — un seul réglage qui s'applique à tous les matériaux d'un coup (multiplie leur
// envMapIntensity individuel, resté à 1 partout), pas la peine d'aller toucher chaque matériau un
// par un. Abaissé après un premier essai à 1 jugé beaucoup trop lumineux/"flashy". Valeur de base
// (lampe éteinte) — voir setEnvironmentIntensity() ci-dessous pour la modulation avec lamp_toggle.
const ENVIRONMENT_INTENSITY_BASE = 0.15;

export function applyEnvironmentLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  scene.environment = pmremGenerator.fromScene(roomEnvironment, 0.04).texture;
  scene.environmentIntensity = ENVIRONMENT_INTENSITY_BASE;
  roomEnvironment.dispose();
  pmremGenerator.dispose();
}

// Descend jusqu'à 0 (pas juste atténuée comme la HemisphereLight diffuse, voir main.ts/
// LAMP_AMBIENT_DIM_FACTOR) quand la lampe s'allume — demande explicite : à la différence de la
// diffuse, qui doit garder un minimum pour ne jamais perdre complètement le fill sur les faces
// opposées à la lampe, l'éclairage ambiant/de réflexion indirecte (studio HDRI générique, sans
// rapport avec la pièce) n'a pas cette contrainte. Appelée à chaque frame depuis animate() (main.ts)
// avec la même progression que setBackgroundDarkness()/diffuse.intensity — coût négligeable (simple
// scalaire, pas un redessin de texture comme le dégradé de fond), pas besoin de la gater sur un
// changement de valeur contrairement à setBackgroundDarkness().
export function setEnvironmentIntensity(scene: THREE.Scene, lampProgress: number): void {
  scene.environmentIntensity = ENVIRONMENT_INTENSITY_BASE * (1 - lampProgress);
}
