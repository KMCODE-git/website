import type * as THREE from "three";

export interface SceneAssets {
  group: THREE.Group;
  interactiveObjects: THREE.Object3D[];
}

export type SceneBuilder = () => Promise<SceneAssets>;
