export interface CameraFocus {
  position: [number, number, number];
  target: [number, number, number];
}

// Résolu par objects/resolveEntries.ts, consommé par main.ts/ui/accessibleNav.ts — un focus
// caméra par objet interactif (Custom Property Blender "animation"=true, voir
// objects/CLAUDE.md), utilisé au clic quand son "animationType" vaut "zoom". `id` ci-dessous
// est `object.name` (déjà unique dans Blender, pas une Custom Property séparée).
export interface FocusEntry {
  id: string;
  focus: CameraFocus;
}

// Ce qu'on écrit à la main dans data/scenes.ts — uniquement pour surcharger le focus
// auto-calculé (objects/autoFocus.ts) quand son résultat par défaut ne convient pas. Les clés
// de `entries` sont les `object.name` Blender des objets à surcharger.
export interface FocusOverride {
  focus?: CameraFocus;
}

export interface SceneConfig {
  // Pose de repos de la caméra : point de départ de la page, cible du léger effet de
  // parallaxe (interactions/parallax.ts) et destination au retour d'un zoom (voir CLAUDE.md
  // racine, "Interaction et caméra").
  defaultCamera: CameraFocus;
  entries?: Record<string, FocusOverride>;
}

// Site à page unique (plus de navigation entre scènes, voir CLAUDE.md racine) : une seule
// configuration, pas de tableau/id/label.
export const sceneConfig: SceneConfig = {
  defaultCamera: {
    // Vue de 3/4, à 45° vers la droite plutôt que de face (même distance à la cible).
    // position.y légèrement relevé (2 -> 2.35, ~5° de plus) pour voir un peu plus d'en haut.
    position: [2.5, 2.35, 2.5],
    target: [0, 0.9, 0],
  },
  entries: {
    // Les clés ci-dessous doivent correspondre au nom Blender de l'objet (object.name — voir
    // objects/CLAUDE.md). Un nouvel objet n'a besoin d'aucune entrée pour fonctionner —
    // computeAutoFocus() se trompe pour un objet très plat/large, très petit, ou dont
    // l'approche par défaut n'est pas pertinente : dans ce cas, calibrer le focus ici à la
    // main (par capture d'écran).
  },
};
