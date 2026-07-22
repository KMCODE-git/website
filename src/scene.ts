import * as THREE from "three";

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e2d3);
  scene.fog = new THREE.Fog(0xe9e2d3, 8, 20);
  return scene;
}
