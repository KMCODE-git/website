import * as THREE from "three";

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
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
