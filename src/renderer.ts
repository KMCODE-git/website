import * as THREE from "three";
import { isLowPowerDevice } from "./deviceCapabilities";

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Plafond réduit sur mobile/tactile (voir deviceCapabilities.ts) : le pixel ratio multiplie la
  // mémoire de TOUS les render targets (scène, shadow map, passes de bloom) — un devicePixelRatio
  // de 3 (courant sur téléphone) capé à 2 reste déjà 4x plus de pixels à traiter qu'à 1x.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isLowPowerDevice ? 1 : 2));
  renderer.shadowMap.enabled = !isLowPowerDevice;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // À `true` par défaut dans Three.js : fait appeler getShaderInfoLog()/getProgramInfoLog()
  // (synchronisation GPU⇄CPU coûteuse) à chaque compilation de programme shader — utile en
  // debug, mais mesuré comme dominant ~85-99% du temps de chaque frame ici (profilé via Chrome
  // DevTools Performance, "getProgramInfoLog" sous EffectComposer.render()), provoquant un
  // saccadé sévère, en particulier quand des matériaux/programmes sont recompilés souvent.
  renderer.debug.checkShaderErrors = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function handleRendererResize(renderer: THREE.WebGLRenderer): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
}
