import type * as THREE from "three";

export interface SceneAssets {
  group: THREE.Group;
  // Racine du modèle chargé (distinct de `group`, qui contient aussi les PointLight ajoutées en
  // code, voir objects/scenes/office.ts) — exposée séparément pour que sceneEntrance.ts anime
  // les objets top-level du modèle lui-même, pas `group` (dont l'unique enfant "visuel" serait
  // ce `model` en entier, animé comme un bloc rigide plutôt que pièce par pièce).
  model: THREE.Object3D;
  interactiveObjects: THREE.Object3D[];
  // Clips d'animation Blender embarqués dans le glTF — voir "animationClip" dans
  // objects/CLAUDE.md et objects/loader.ts (findClipForObject()).
  animations: THREE.AnimationClip[];
}
