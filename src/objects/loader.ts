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

export interface LoadedModel {
  scene: THREE.Group;
  // Clips d'animation Blender embarqués dans le glTF (ex. Aquarium : poissons/bulles) — un seul
  // clip peut regrouper plusieurs objets/canaux (voir "animationClip" dans objects/CLAUDE.md),
  // pas forcément un clip par objet interactif.
  animations: THREE.AnimationClip[];
}

export async function loadModel(path: string): Promise<LoadedModel> {
  const gltf = await loader.loadAsync(path);
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return { scene: gltf.scene, animations: gltf.animations };
}

// Associe un clip à un objet interactif portant la Custom Property "animationClip" : par nom en
// priorité (renommer l'Action Blender pour matcher object.name est le plus robuste si plusieurs
// objets ont chacun leur clip un jour), sinon par défaut le seul clip du fichier s'il n'y en a
// qu'un — cas de l'Aquarium aujourd'hui (clip nommé "Animation" par défaut, jamais renommé).
export function findClipForObject(animations: THREE.AnimationClip[], object: THREE.Object3D): THREE.AnimationClip | null {
  const byName = THREE.AnimationClip.findByName(animations, object.name);
  if (byName) return byName;
  return animations.length === 1 ? animations[0] : null;
}

// Un objet devient interactif avec une Custom Property Blender : "animation" (Boolean,
// attention le "+" de Blender crée un Float par défaut, il faut changer le Type manuellement)
// — sa seule présence à `true` suffit (survol = léger mouvement vers le haut, voir
// interactions/objectAnimations.ts ; clic = activé). Pas de "id" séparé à poser : `object.name`
// (déjà unique par objet dans Blender, sans rien configurer) sert d'identifiant partout où il
// en faut un (voir objects/resolveEntries.ts). Ce que fait le clic dépend d'une deuxième
// Custom Property, "animationType" (String, ex. "zoom"), lue directement sur l'objet dans
// main.ts. Condition à l'export glTF : "Custom Properties" coché — GLTFLoader copie alors ces
// extras dans userData automatiquement, sans rien coder par objet.
//
// "link" (String, ex. "contact") rend aussi un objet interactif à lui seul, sans "animation" —
// il identifie une navigation vers un panneau/une page de contenu plutôt qu'une animation locale
// (voir data/links.ts, ui/linkOverlay.ts, "clic de base" dans CLAUDE.md racine).
export function collectInteractiveObjects(model: THREE.Object3D): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  model.traverse((child) => {
    if (child.userData.animation === true || typeof child.userData.link === "string") {
      objects.push(child);
    }
  });
  return objects;
}
