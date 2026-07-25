import * as THREE from "three";

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd9c7a3);
  scene.fog = new THREE.Fog(0xd9c7a3, 8, 20);
  return scene;
}
