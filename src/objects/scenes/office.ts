import * as THREE from "three";
import { loadModel, collectInteractiveObjects } from "../loader";
import type { SceneAssets } from "./types";

const MODEL_PATH = "/models/office.glb";
const LED_PANEL_COUNT = 13;

// Blanc chaud subtil (~ 3000K) — assigné en code plutôt que dans Blender pour rester
// calé contre notre seuil de bloom (postprocessing.ts) sans réexporter à chaque essai.
const WARM_COLOR = 0xffdfb0;

function applyWarmEmissive(mesh: THREE.Mesh, intensity: number): void {
  mesh.material = new THREE.MeshStandardMaterial({
    color: WARM_COLOR,
    emissive: WARM_COLOR,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0,
  });
}

function addLightAt(object: THREE.Object3D, group: THREE.Group, intensity: number, distance: number): THREE.PointLight {
  const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
  const light = new THREE.PointLight(WARM_COLOR, intensity, distance, 2);
  light.position.copy(center);
  group.add(light);
  return light;
}

function litWarm(model: THREE.Object3D, name: string, group: THREE.Group, emissiveIntensity: number, lightIntensity: number, lightDistance: number): void {
  const object = model.getObjectByName(name);
  if (!(object instanceof THREE.Mesh)) {
    console.warn(`"${name}" introuvable dans ${MODEL_PATH} — pas de lumière ajoutée.`);
    return;
  }
  applyWarmEmissive(object, emissiveIntensity);
  // Référencée sur le mesh lui-même : "swap_light_color" (Led_pannels, objectAnimations.ts)
  // retrouve la lumière associée à chaque panneau via userData plutôt que de la recevoir en
  // paramètre — évite de faire remonter la liste des PointLight jusqu'à l'appelant.
  object.userData.emissiveLight = addLightAt(object, group, lightIntensity, lightDistance);
}

export async function buildOfficeScene(): Promise<SceneAssets> {
  const group = new THREE.Group();

  const { scene: model, animations } = await loadModel(MODEL_PATH);

  // Aligne la base du modèle sur le sol (y=0), quelle que soit l'origine choisie à l'export.
  const bounds = new THREE.Box3().setFromObject(model);
  model.position.y -= bounds.min.y;

  group.add(model);

  litWarm(model, "NeonStrip", group, 1.3, 1, 3);
  for (let i = 1; i <= LED_PANEL_COUNT; i++) {
    litWarm(model, `Led_pannel${i}`, group, 0.67, 0.1, 0);
  }

  return { group, model, interactiveObjects: collectInteractiveObjects(model), animations };
}
