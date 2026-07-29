import * as THREE from "three";

// "lamp_toggle" (ex. Lamp) : bascule persistante (pas un one-shot, comme "swap_light_color") —
// allume/éteint l'émissif du sous-objet "bulb" (Custom Property `animationType="bulb"`, même
// convention que "screen") + une PointLight associée, en fondu (même vitesse que
// screenGlow.ts/SCREEN_GLOW_SPEED mais plus lente : "on allume la lampe" doit se sentir un peu
// progressif, pas instantané comme un écran qui s'éclaire au survol).
const LAMP_GLOW_SPEED = 0.12;
const LAMP_BULB_COLOR = new THREE.Color(0xffdfb0); // blanc chaud, voir CLAUDE.md racine
const LAMP_EMISSIVE_INTENSITY = 2.2;
// Relevé depuis 1.4 (demande explicite : "intensifie un peu la lumière de la lampe") — la pièce
// s'assombrit nettement plus qu'avant maintenant que scene.environmentIntensity descend jusqu'à 0
// en synchro (voir scene.ts/setEnvironmentIntensity()), la lampe doit rester le point lumineux
// principal de la scène une fois allumée plutôt que paraître plus faible qu'avant en comparaison.
const LAMP_LIGHT_INTENSITY = 1.9;
const LAMP_LIGHT_DISTANCE = 4;

// État d'un sous-objet "bulb" — même principe que screenGlow.ts (émissif fondu + progress), plus
// une PointLight associée (créée une fois, ajoutée comme enfant de l'objet interactif racine)
// puisque contrairement à "screen", cette lueur doit aussi éclairer réellement les alentours, pas
// seulement paraître allumée.
interface LampGlowState {
  material: THREE.MeshStandardMaterial;
  baseEmissiveIntensity: number;
  baseEmissive: THREE.Color;
  light: THREE.PointLight;
  on: boolean;
  progress: number;
}

export interface LampGlowSystem {
  // Bascule tous les sous-objets "bulb" de `object` — renvoie false (rien trouvé, avertissement
  // déjà émis) si aucun sous-objet "bulb" n'existe, pour que l'appelant (objectAnimations.ts)
  // sache renvoyer "blocked" plutôt que "started".
  trigger: (object: THREE.Object3D) => boolean;
  update: () => void;
  // Progression (0..1, lissée) de la dernière lampe basculée — voir CLAUDE.md racine, "Lampe".
  getProgress: () => number;
}

// Écrit sur material.emissive*/une PointLight, jamais sur position/rotation/scale de l'objet
// interactif lui-même : indépendant du cœur ObjectState/active de objectAnimations.ts (qui gère
// séparément le petit mouvement de balancier associé à "lamp_toggle", voir ce fichier).
export function createLampGlowSystem(reducedMotion: boolean): LampGlowSystem {
  const lampGlows = new Map<THREE.Mesh, LampGlowState>();

  // "bulb" (Custom Property posée sur un SOUS-objet de la lampe, même convention que "screen")
  // marque quel(s) mesh(es) doivent s'allumer — traverse() inclut l'objet lui-même, donc couvre
  // aussi le cas où l'objet interactif racine porte directement cette valeur.
  function findBulbMeshes(object: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.animationType === "bulb") {
        meshes.push(child);
      }
    });
    return meshes;
  }

  // Contrairement à "screen" (qui ne fait que paraître allumé), une lampe doit aussi éclairer
  // réellement les alentours — une PointLight est créée une fois ici, positionnée au centre de
  // l'ampoule (converti dans le repère local de l'objet interactif racine, sur lequel elle est
  // ajoutée comme enfant) puis réutilisée à chaque bascule.
  function getLampGlow(rootObject: THREE.Object3D, mesh: THREE.Mesh): LampGlowState | null {
    let state = lampGlows.get(mesh);
    if (state) return state;
    if (!(mesh.material instanceof THREE.MeshStandardMaterial)) {
      console.warn(`"${mesh.name}" a animationType="bulb" mais son matériau n'a pas d'émissif (MeshStandardMaterial attendu) — effet ignoré.`);
      return null;
    }
    // Clone avant de toucher à quoi que ce soit — même précaution que screenGlow.ts (matériau
    // potentiellement partagé entre plusieurs meshes côté Blender).
    const material = mesh.material.clone();
    mesh.material = material;

    const worldCenter = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    const localCenter = rootObject.worldToLocal(worldCenter.clone());
    const light = new THREE.PointLight(LAMP_BULB_COLOR, 0, LAMP_LIGHT_DISTANCE, 2);
    light.position.copy(localCenter);
    rootObject.add(light);

    state = {
      material,
      baseEmissiveIntensity: material.emissiveIntensity,
      baseEmissive: material.emissive.clone(),
      light,
      on: false,
      progress: 0,
    };
    lampGlows.set(mesh, state);
    return state;
  }

  return {
    trigger(object) {
      const bulbMeshes = findBulbMeshes(object);
      if (bulbMeshes.length === 0) {
        console.warn(`"${object.name}" a animationType="lamp_toggle" mais aucun sous-objet "bulb" n'a été trouvé (Custom Property animationType="bulb" sur l'ampoule) — rien à allumer.`);
        return false;
      }
      for (const mesh of bulbMeshes) {
        const state = getLampGlow(object, mesh);
        if (state) state.on = !state.on;
      }
      return true;
    },
    // Pas de retour "geometry changed" ici (comme screenGlow.ts) : une PointLight sans castShadow
    // ne pèse jamais sur la shadow map, inutile de la traiter comme un changement de géométrie
    // pour renderer.shadowMap.needsUpdate (voir CLAUDE.md racine).
    update() {
      if (lampGlows.size === 0) return;
      for (const state of lampGlows.values()) {
        const target = state.on ? 1 : 0;
        state.progress = reducedMotion ? target : state.progress + (target - state.progress) * LAMP_GLOW_SPEED;
        if (Math.abs(target - state.progress) < 0.001) state.progress = target;
        state.material.emissiveIntensity = state.baseEmissiveIntensity + (LAMP_EMISSIVE_INTENSITY - state.baseEmissiveIntensity) * state.progress;
        state.material.emissive.copy(state.baseEmissive).lerp(LAMP_BULB_COLOR, state.progress);
        state.light.intensity = LAMP_LIGHT_INTENSITY * state.progress;
      }
    },
    // Une seule valeur suffit pour l'usage actuel (une seule lampe sur le site) ; renvoie le
    // maximum parmi toutes les lampes connues plutôt qu'une valeur suivie séparément, pour rester
    // correct si une seconde venait à exister.
    getProgress() {
      let max = 0;
      for (const state of lampGlows.values()) max = Math.max(max, state.progress);
      return max;
    },
  };
}
