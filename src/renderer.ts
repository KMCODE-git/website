import * as THREE from "three";

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  // Pas d'antialiasing MSAA ici (`antialias: true` retiré) : toute la scène passe exclusivement
  // par composer.render() (postprocessing.ts), jamais par un renderer.render() direct — la scène
  // est rasterisée dans une render target hors-écran non multisamplée (EffectComposer, sans
  // `samples`), donc l'antialiasing du contexte WebGL par défaut ne s'applique jamais aux arêtes
  // de la géométrie (seule la passe finale, un simple quad plein écran, touche le vrai canvas —
  // rien à lisser sur un rectangle). Le flag ne faisait donc déjà rien visuellement, juste
  // allouer un framebuffer par défaut multisamplé pour rien.
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Recalculée manuellement (renderer.shadowMap.needsUpdate) plutôt qu'à chaque frame par
  // défaut — la scène est immobile la plupart du temps (parallaxe légère mise à part, qui ne
  // déplace que la caméra, jamais ce qui projette une ombre) ; recalculer une shadow map
  // 2048×2048 en continu même quand rien ne bouge est un coût GPU permanent pour rien. main.ts
  // (animate()) ne force needsUpdate=true que les frames où interactions/objectAnimations.ts
  // rapporte un changement de géométrie réel — voir CLAUDE.md racine.
  renderer.shadowMap.autoUpdate = false;
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
