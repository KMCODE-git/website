import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

// Décodeur Draco requis dès qu'un .glb exporté avec compression géométrique Draco est chargé
// (GLTFLoader lève sinon "No DRACOLoader instance provided" et n'importe rien) — fichiers
// wasm/js servis tels quels depuis public/draco/ (copiés depuis
// node_modules/three/examples/jsm/libs/draco/gltf/, à resynchroniser si three est mis à jour).
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

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

// Un objet devient interactif avec une seule Custom Property Blender : "animation" (Boolean,
// attention le "+" de Blender crée un Float par défaut, il faut changer le Type manuellement)
// — sa seule présence à `true` suffit (survol = léger mouvement vers le haut, voir
// interactions/objectAnimations.ts ; clic = activé). Pas de "id" séparé à poser : `object.name`
// (déjà unique par objet dans Blender, sans rien configurer) sert d'identifiant partout où il
// en faut un (voir objects/resolveEntries.ts). Ce que fait le clic dépend d'une deuxième
// Custom Property, "animationType" (String, ex. "zoom"), lue directement sur l'objet dans
// main.ts. Condition à l'export glTF : "Custom Properties" coché — GLTFLoader copie alors ces
// extras dans userData automatiquement, sans rien coder par objet.
export function collectInteractiveObjects(model: THREE.Object3D): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  model.traverse((child) => {
    if (child.userData.animation === true) {
      objects.push(child);
    }
  });
  return objects;
}
