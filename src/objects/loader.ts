import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

// Décodeur Draco requis dès qu'un .glb exporté avec compression géométrique Draco est chargé
// (GLTFLoader lève sinon "No DRACOLoader instance provided" et n'importe rien) — fichiers
// wasm/js servis tels quels depuis public/draco/ (copiés depuis
// node_modules/three/examples/jsm/libs/draco/gltf/, à resynchroniser si three est mis à jour).
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");

// Textures KTX2/Basis Universal (extension glTF KHR_texture_basisu) : réduit fortement le poids
// des textures (voir CLAUDE.md racine, "Poids du modèle") ET la mémoire GPU consommée au
// chargement (contrairement à un PNG/JPEG décodé puis re-uploadé tel quel, KTX2 reste compressé
// une fois en VRAM). Transcodeur servi depuis public/basis/ (copié depuis
// node_modules/three/examples/jsm/libs/basis/, à resynchroniser si three est mis à jour) — même
// principe que le décodeur Draco ci-dessus.
const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath("/basis/");

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
loader.setKTX2Loader(ktx2Loader);

// KTX2Loader doit choisir le format de transcodage cible (ASTC/ETC1/BC7/PVRTC...) selon ce que le
// GPU courant supporte réellement — nécessite le WebGLRenderer réel, pas disponible au chargement
// du module (créé plus tard dans main.ts/startApp()). Appelée une fois depuis main.ts avant le
// premier loadModel() ; sans cet appel, KTX2Loader lève une erreur au premier fichier .ktx2
// rencontré ("KTX2Loader: Missing DXT/ETC/PVRTC/ASTC support brut").
export function configureKtx2Support(renderer: THREE.WebGLRenderer): void {
  ktx2Loader.detectSupport(renderer);
}

export interface LoadedModel {
  scene: THREE.Group;
  // Clips d'animation Blender embarqués dans le glTF (ex. Aquarium : poissons/bulles) — un seul
  // clip peut regrouper plusieurs objets/canaux (voir "animationClip" dans objects/CLAUDE.md),
  // pas forcément un clip par objet interactif.
  animations: THREE.AnimationClip[];
}

// Génère un UV planaire simple (projection des sommets sur les deux axes de plus grande étendue
// de la bounding box locale — un mesh plat n'a presque aucune épaisseur sur le troisième) pour un
// mesh qui n'en a aucun. Renvoie `true` si un UV a réellement été généré (rien à faire, donc
// `false`, si le mesh en avait déjà un) — permet à chaque appelant de décider s'il doit avertir en
// console. Cas d'usage : au chargement (voir loadModel() ci-dessous, tout mesh dont le matériau
// EXPORTÉ référence déjà une texture mais sans UV — trouvé via le validateur glTF officiel sur
// `Mac_structure`/matériau "soil_A", `texCoord: -1` hors spec, sans incidence sur le rendu en soi
// puisque GLTFLoader ignore ce champ si `<= 0`, mais révélateur de l'absence totale d'UV
// sous-jacente) ; et dans `interactions/animations/screenGlow.ts`, pour un mesh dont l'`emissiveMap`
// (bruit "neige TV") est assignée dynamiquement APRÈS le chargement — un cas que ce contrôle
// générique, exécuté une seule fois ici, ne peut pas anticiper (ex. `Mac_screen`, dont le matériau
// exporté n'a lui-même aucune texture).
export function ensurePlanarUv(mesh: THREE.Mesh): boolean {
  const geometry = mesh.geometry;
  if (geometry.attributes.uv) return false;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const min = [box.min.x, box.min.y, box.min.z];
  const size = [box.max.x - min[0], box.max.y - min[1], box.max.z - min[2]];
  const [uAxis, vAxis] = [0, 1, 2].sort((a, b) => size[b] - size[a]);
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = size[uAxis] > 0 ? (position.getComponent(i, uAxis) - min[uAxis]) / size[uAxis] : 0;
    uv[i * 2 + 1] = size[vAxis] > 0 ? (position.getComponent(i, vAxis) - min[vAxis]) / size[vAxis] : 0;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return true;
}

// Propriétés de THREE.MeshStandardMaterial qui ont besoin d'un UV pour être échantillonnées —
// envMap (reflet d'environnement) exclu volontairement, il n'en a jamais besoin.
const UV_DEPENDENT_MAP_KEYS = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "bumpMap", "alphaMap"] as const;

function materialNeedsUv(material: THREE.Material): boolean {
  return UV_DEPENDENT_MAP_KEYS.some((key) => key in material && (material as unknown as Record<string, unknown>)[key]);
}

export async function loadModel(path: string): Promise<LoadedModel> {
  const gltf = await loader.loadAsync(path);
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      if (materials.some(materialNeedsUv) && ensurePlanarUv(child)) {
        console.warn(`"${child.name}" a un matériau texturé mais aucun UV exporté depuis Blender — UV planaire généré automatiquement en repli (voir ensurePlanarUv(), objects/loader.ts).`);
      }
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
