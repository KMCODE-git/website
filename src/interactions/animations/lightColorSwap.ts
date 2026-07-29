import * as THREE from "three";
import { easeInOutCubic } from "./easing";

const LIGHT_COLOR_SWAP_DURATION_MS = 600;

// Poids Rec.709 utilisés par la luminance perçue (même formule que le seuil de bloom de
// UnrealBloomPass, voir postprocessing.ts) — le vert pèse ~10x plus que le bleu, donc une même
// emissiveIntensity donne un rendu très inégal selon la teinte (vert/cyan éclatants, bleu/violet
// ternes) si on ne compense pas.
const LUMINANCE_WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 };
function relativeLuminance(color: THREE.Color): number {
  return color.r * LUMINANCE_WEIGHTS.r + color.g * LUMINANCE_WEIGHTS.g + color.b * LUMINANCE_WEIGHTS.b;
}

interface LightColorOption {
  color: THREE.Color;
  intensity: number;
}

// Blanc chaud de référence (même teinte que LAMP_BULB_COLOR, lampGlow.ts) à une intensité de
// repère (0.67, arbitraire mais stable) — sert de référence de luminance pour calibrer les autres
// teintes de la palette ci-dessous, indépendamment de toute lumière réellement présente dans la
// scène (ancien lien vers objects/scenes/office.ts retiré : NeonStrip/Led_pannels n'existent plus
// depuis le passage à office_lite.glb, voir CLAUDE.md racine).
const BASE_LIGHT_COLOR = new THREE.Color(0xffdfb0);
const BASE_LIGHT_INTENSITY = 0.67;
const TARGET_LUMINANCE = relativeLuminance(BASE_LIGHT_COLOR) * BASE_LIGHT_INTENSITY;

// intensity calculée pour que chaque teinte retombe sur la même luminance perçue que le blanc
// chaud par défaut (TARGET_LUMINANCE) — sans ça, cycler dans la palette donne l'impression que
// certaines couleurs "n'allument" pas autant que d'autres.
function calibratedLightColor(hex: number): LightColorOption {
  const color = new THREE.Color(hex);
  return { color, intensity: TARGET_LUMINANCE / relativeLuminance(color) };
}

// Palette cyclique pour "swap_light_color" (Led_pannels) : base (blanc chaud) - rouge - vert -
// violet - rose - cyan.
const LIGHT_COLOR_PALETTE: LightColorOption[] = [
  { color: BASE_LIGHT_COLOR, intensity: BASE_LIGHT_INTENSITY },
  calibratedLightColor(0xff0000), // rouge
  calibratedLightColor(0x00ff00), // vert
  calibratedLightColor(0x8000ff), // violet
  calibratedLightColor(0xff1493), // rose
  calibratedLightColor(0x00ffff), // cyan
];

// "swap_light_color" fait tourner l'émissif + la PointLight associée (voir
// object.userData.emissiveLight, posé côté objet interactif pour les meshes qui en ont une — non
// utilisé par le modèle actuel, office_lite.glb, mais laissé en place pour un futur objet) de tous
// les meshes descendants vers la couleur suivante de LIGHT_COLOR_PALETTE — comme "swap", ne revient
// jamais à l'état précédent : chaque clic avance d'un cran dans la palette.
interface LightColorSwap {
  material: THREE.MeshStandardMaterial;
  light: THREE.PointLight | null;
  fromColor: THREE.Color;
  toColor: THREE.Color;
  startTime: number;
}

export interface LightColorSwapSystem {
  trigger: (object: THREE.Object3D) => void;
  update: () => void;
}

// Écrit sur material.emissive*/PointLight de descendants arbitraires, jamais sur
// position/rotation/scale de l'objet interactif lui-même : indépendant du cœur lift/one-shot de
// objectAnimations.ts, extrait ici sans rien partager avec lui au-delà de `reducedMotion`.
export function createLightColorSwapSystem(reducedMotion: boolean): LightColorSwapSystem {
  // Index courant dans LIGHT_COLOR_PALETTE, par objet interactif (ex. Led_pannels) — pas par
  // mesh, puisque tous les descendants avancent ensemble d'un cran au même clic.
  const lightColorIndex = new WeakMap<THREE.Object3D, number>();
  const lightColorSwaps = new Map<THREE.MeshStandardMaterial, LightColorSwap>();
  const tmpColor = new THREE.Color();

  // État actuel (couleur + intensité) d'un matériau déjà en transition (sinon son état émissif au
  // repos) — point de départ propre si on re-clique avant la fin du fondu précédent, plutôt que
  // de sauter depuis l'ancienne cible. Intensité toujours dérivée de la couleur (voir update()),
  // jamais stockée/interpolée elle-même.
  function currentLightColorState(material: THREE.MeshStandardMaterial): LightColorOption {
    const existing = lightColorSwaps.get(material);
    if (!existing) return { color: material.emissive.clone(), intensity: material.emissiveIntensity };
    const u = Math.min((performance.now() - existing.startTime) / LIGHT_COLOR_SWAP_DURATION_MS, 1);
    const color = existing.fromColor.clone().lerp(existing.toColor, easeInOutCubic(u));
    return { color, intensity: TARGET_LUMINANCE / relativeLuminance(color) };
  }

  return {
    trigger(object) {
      // Avance d'un cran dans la palette pour tous les descendants portant une lumière associée
      // (voir userData.emissiveLight, non peuplé par le modèle actuel — voir plus haut) — un clic
      // change la couleur pour tout le groupe (ex. les 13 panneaux de Led_pannels), pas panneau
      // par panneau.
      const currentIndex = lightColorIndex.get(object) ?? 0;
      const nextIndex = (currentIndex + 1) % LIGHT_COLOR_PALETTE.length;
      lightColorIndex.set(object, nextIndex);
      const target = LIGHT_COLOR_PALETTE[nextIndex];
      const startTime = performance.now();
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
        const light = (child.userData.emissiveLight as THREE.PointLight | undefined) ?? null;
        const from = currentLightColorState(child.material);
        if (reducedMotion) {
          child.material.emissive.copy(target.color);
          child.material.emissiveIntensity = target.intensity;
          if (light) light.color.copy(target.color);
          return;
        }
        lightColorSwaps.set(child.material, {
          material: child.material,
          light,
          fromColor: from.color,
          toColor: target.color.clone(),
          startTime,
        });
      });
    },
    update() {
      if (lightColorSwaps.size === 0) return;
      for (const [material, swap] of lightColorSwaps) {
        const u = Math.min((performance.now() - swap.startTime) / LIGHT_COLOR_SWAP_DURATION_MS, 1);
        const eased = easeInOutCubic(u);
        tmpColor.copy(swap.fromColor).lerp(swap.toColor, eased);
        material.emissive.copy(tmpColor);
        // Intensité recalculée à partir de la couleur INTERPOLÉE de cette frame, pas interpolée
        // linéairement en parallèle entre une intensité de départ et d'arrivée : chaque teinte de
        // la palette n'est calibrée (intensity × luminance-couleur = TARGET_LUMINANCE, voir
        // calibratedLightColor()) qu'à ses propres extrémités. Interpoler intensité et couleur
        // séparément fait diverger leur produit à mi-fondu (l'un monte pendant que l'autre
        // descend, sans jamais repasser exactement par la cible) — visible comme un halo qui
        // s'allume fort avant de retomber à l'intensité normale. Recalculer ainsi maintient la
        // luminance perçue ~constante sur tout le fondu, pas seulement aux deux bouts.
        material.emissiveIntensity = TARGET_LUMINANCE / relativeLuminance(tmpColor);
        if (swap.light) swap.light.color.copy(tmpColor);
        if (u >= 1) lightColorSwaps.delete(material);
      }
    },
  };
}
