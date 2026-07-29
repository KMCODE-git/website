import * as THREE from "three";
import { loadModel, collectInteractiveObjects } from "../loader";
import type { SceneAssets } from "./types";

const MODEL_PATH = "/models/office_lite.glb";

// Plan large (20x20, très au-delà de l'empreinte du bureau) posé au niveau du sol (y=0, même
// référence que l'alignement du modèle ci-dessous) — reçoit l'ombre de la lumière du dessus
// (lighting.ts) sans jamais afficher de vraie géométrie de sol. `THREE.ShadowMaterial` ne
// rend QUE l'ombre qu'il reçoit (zones non ombrées entièrement transparentes) : le fond de la
// scène (scene.ts) continue de se voir derrière/sous les objets, l'ombre semble flotter dessus
// plutôt que reposer sur un sol visible — effet vu sur la maquette de référence (helpers/,
// non versionné).
function createShadowCatcher(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(20, 20);
  const material = new THREE.ShadowMaterial({ opacity: 0.35 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

export async function buildOfficeScene(): Promise<SceneAssets> {
  const group = new THREE.Group();

  const { scene: model, animations } = await loadModel(MODEL_PATH);

  // Aligne la base du modèle sur le sol (y=0), quelle que soit l'origine choisie à l'export.
  const bounds = new THREE.Box3().setFromObject(model);
  model.position.y -= bounds.min.y;

  group.add(model);
  group.add(createShadowCatcher());

  return { group, model, interactiveObjects: collectInteractiveObjects(model), animations };
}
