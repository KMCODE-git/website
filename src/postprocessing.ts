import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export function createPostprocessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.55, // strength
    0.4, // radius
    0.95 // threshold: only bright emissive areas bloom (relevé pour un fond clair, sinon le décor entier brille)
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return composer;
}

export function handlePostprocessingResize(composer: EffectComposer): void {
  composer.setSize(window.innerWidth, window.innerHeight);
}
