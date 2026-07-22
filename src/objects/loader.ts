import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();

export async function loadModel(path: string): Promise<THREE.Group> {
  const gltf = await loader.loadAsync(path);
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return gltf.scene;
}

// Un objet devient cliquable avec deux Custom Properties Blender : "action" (Boolean) =
// true, et "id" (String, unique par objet) — "action" est le vrai déclencheur (un objet
// peut porter un "id" pour d'autres besoins sans être cliquable), "id" reste l'identifiant
// utilisé pour la résolution du contenu (voir objects/resolveEntries.ts). Condition à
// l'export glTF : "Custom Properties" coché — GLTFLoader copie alors ces extras dans
// userData automatiquement, sans rien coder par objet.
export function collectInteractiveObjects(model: THREE.Object3D): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  model.traverse((child) => {
    if (child.userData.action === true && child.userData.id) {
      objects.push(child);
    }
  });
  return objects;
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

// Libère géométries/matériaux/textures d'un sous-arbre — indispensable en changeant de
// scène (les .glb peuvent peser plusieurs dizaines de Mo), sinon la mémoire GPU s'accumule
// à chaque aller-retour entre scènes.
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      disposeMaterial(material);
    }
  });
}
