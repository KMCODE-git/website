import * as THREE from "three";

// Vitesse de fondu du "screen" — même logique que le survol-lift (objectAnimations.ts) : couplé
// directement au survol (pas une timeline fixe), pour s'éteindre aussi vite que le survol se
// termine.
const SCREEN_GLOW_SPEED = 0.25;
// Calibré par capture d'écran (voir git log) : un bleu quasi-blanc (proche de la couleur de base
// du bloom) blowout en blanc plein dès une intensité ~2 à cause du seuil de bloom
// (postprocessing.ts, 0.95) — un bleu plus saturé reste lisible comme "écran allumé" sans tout
// cramer, même à une intensité plus confortablement au-dessus du seuil.
const SCREEN_EMISSIVE_INTENSITY = 2.5;
const SCREEN_COLOR = new THREE.Color(0x3a6ea5);

// Bruit "neige TV" plutôt qu'un fondu de couleur uni — demande explicite ("effet de bruit/neige
// façon écran qui grésille"). Petit canvas (regénéré en `putImageData`, pas pixel par pixel via
// `fillRect` — bien plus rapide) : la texture est volontairement grossière/pixelisée
// (`THREE.NearestFilter`, voir plus bas), un vrai grain fin serait de toute façon lissé par le
// mapping UV avant d'être perceptible à la taille d'un écran de bureau/iPhone.
const NOISE_SIZE = 48;

interface ScreenGlowState {
  material: THREE.MeshStandardMaterial;
  baseEmissiveIntensity: number;
  baseEmissive: THREE.Color;
  hovered: boolean;
  progress: number;
  noiseCanvas: HTMLCanvasElement;
  noiseCtx: CanvasRenderingContext2D;
  noiseImageData: ImageData;
  noiseTexture: THREE.CanvasTexture;
  // Sous prefers-reduced-motion, le bruit ne doit PAS scintiller en continu (un flicker/strobe est
  // un déclencheur classique d'inconfort/de crises photosensibles, bien plus que le fondu de
  // couleur qu'il remplace) — une seule image de bruit générée une fois à l'activation, jamais
  // régénérée ensuite, plutôt que désactiver l'effet entièrement.
  noiseGenerated: boolean;
}

export interface ScreenGlowSystem {
  // Bascule tous les sous-objets "screen" de `object` (voir findScreenMeshes ci-dessous) — appelé
  // pour l'ancien ET le nouveau hoveredObject à chaque changement de survol (objectAnimations.ts).
  setHovered: (object: THREE.Object3D, hovered: boolean) => void;
  update: () => void;
}

// Remplit `imageData` de bruit gris aléatoire et pousse le résultat vers le CanvasTexture associé —
// factorisé hors de update() puisqu'appelé à la fois en continu (mouvement normal) et une seule
// fois (prefers-reduced-motion, voir ScreenGlowState.noiseGenerated ci-dessus).
function regenerateNoise(state: ScreenGlowState): void {
  const { data } = state.noiseImageData;
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.random() * 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  state.noiseCtx.putImageData(state.noiseImageData, 0, 0);
  state.noiseTexture.needsUpdate = true;
}

// "screen" (Custom Property posée sur un sous-objet de l'objet interactif, ex. Mac_screen) fait
// s'allumer un écran tant que le parent est survolé — voir CLAUDE.md racine et objects/CLAUDE.md.
// Écrit sur material.emissive*/emissiveMap, jamais sur position/rotation/scale : totalement
// indépendant du cœur ObjectState/active de objectAnimations.ts, extrait ici sans rien partager
// avec lui au-delà de `reducedMotion`.
export function createScreenGlowSystem(reducedMotion: boolean): ScreenGlowSystem {
  const screenGlows = new Map<THREE.Mesh, ScreenGlowState>();

  // traverse() inclut l'objet lui-même, donc ça couvre aussi le cas où l'objet interactif racine
  // porte directement cette valeur.
  function findScreenMeshes(object: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.animationType === "screen") {
        meshes.push(child);
      }
    });
    return meshes;
  }

  // Couplé directement au survol (comme le lift), pas une timeline fixe indépendante — sans ça,
  // deux écrans survolés à quelques instants d'intervalle peuvent sembler allumés simultanément
  // (celui de l'objet précédent finit encore son propre cycle) alors qu'aucun des deux n'est
  // réellement survolé au même moment.
  function getScreenGlow(mesh: THREE.Mesh): ScreenGlowState | null {
    let state = screenGlows.get(mesh);
    if (state) return state;
    if (!(mesh.material instanceof THREE.MeshStandardMaterial)) {
      console.warn(`"${mesh.name}" a animationType="screen" mais son matériau n'a pas d'émissif (MeshStandardMaterial attendu) — effet ignoré.`);
      return null;
    }
    // Clone avant de toucher à quoi que ce soit : deux meshes "screen" différents peuvent
    // partager le même matériau côté Blender (mesh dupliqué sans "rendre le matériau unique",
    // déjà rencontré entre Mac_screen/iPad_screen et iPhone_screen/Apple_watch_screen) — sans ce
    // clone, animer l'émissif de l'un allumerait aussi tous ceux qui partagent la ressource.
    const material = mesh.material.clone();
    mesh.material = material;

    const noiseCanvas = document.createElement("canvas");
    noiseCanvas.width = NOISE_SIZE;
    noiseCanvas.height = NOISE_SIZE;
    const noiseCtx = noiseCanvas.getContext("2d")!;
    const noiseImageData = noiseCtx.createImageData(NOISE_SIZE, NOISE_SIZE);
    const noiseTexture = new THREE.CanvasTexture(noiseCanvas);
    noiseTexture.colorSpace = THREE.SRGBColorSpace;
    // Nearest (pas Linear) : un lissage rendrait le bruit flou/uniforme à cette résolution, on veut
    // au contraire des blocs de grain bien distincts, comme une vraie neige TV pixelisée.
    noiseTexture.magFilter = THREE.NearestFilter;
    noiseTexture.minFilter = THREE.NearestFilter;
    material.emissiveMap = noiseTexture;

    state = {
      material,
      baseEmissiveIntensity: material.emissiveIntensity,
      baseEmissive: material.emissive.clone(),
      hovered: false,
      progress: 0,
      noiseCanvas,
      noiseCtx,
      noiseImageData,
      noiseTexture,
      noiseGenerated: false,
    };
    screenGlows.set(mesh, state);
    return state;
  }

  return {
    setHovered(object, hovered) {
      for (const mesh of findScreenMeshes(object)) {
        const state = getScreenGlow(mesh);
        if (state) state.hovered = hovered;
      }
    },
    update() {
      if (screenGlows.size === 0) return;
      for (const state of screenGlows.values()) {
        const target = state.hovered ? 1 : 0;
        state.progress = reducedMotion ? target : state.progress + (target - state.progress) * SCREEN_GLOW_SPEED;
        if (Math.abs(target - state.progress) < 0.001) state.progress = target;
        state.material.emissiveIntensity = state.baseEmissiveIntensity + (SCREEN_EMISSIVE_INTENSITY - state.baseEmissiveIntensity) * state.progress;
        state.material.emissive.copy(state.baseEmissive).lerp(SCREEN_COLOR, state.progress);

        if (state.progress <= 0) {
          // Complètement éteint : pas la peine de régénérer du bruit invisible (emissiveIntensity
          // retombé à sa valeur de base). Prêt à re-scintiller au prochain survol.
          state.noiseGenerated = false;
        } else if (reducedMotion) {
          if (!state.noiseGenerated) {
            regenerateNoise(state);
            state.noiseGenerated = true;
          }
        } else {
          regenerateNoise(state);
        }
      }
    },
  };
}
