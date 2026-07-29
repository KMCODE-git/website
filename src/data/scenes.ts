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
    // Vue de face, proche du bureau — inclinaison réduite par rapport à un premier essai (ratio
    // hauteur/distance plus faible) et target.x décalé pour recentrer sur le bureau (le setup
    // n'est pas centré sur x=0 dans le modèle, voir objects/scenes/office.ts : Desk/Chair/Plant
    // sont tous à x positif).
    //
    // position.x décalé (0 -> 0.28) : PAS un bug de parallax.ts (son calcul offset=0 au centre de
    // l'écran est correct) — cette pose de repos elle-même n'était pas encore assez recentrée sur
    // le bureau, et il fallait donc déplacer la souris tout à gauche de l'écran pour que la
    // parallaxe (interactions/parallax.ts, offsetX = -pointerX * MAX_OFFSET_X) compense l'écart et
    // affiche enfin le bon cadrage. Ce décalage reproduit exactement l'offset que produirait la
    // parallaxe à pointerX=-1 (le long de baseRight, ≈ +X ici) — bake dans la pose de repos plutôt
    // que de devoir déplacer la souris pour l'obtenir.
    position: [0.28, 2.8, 3.6],
    target: [0.35, 0.7, 0],
  },
  entries: {
    // Les clés ci-dessous doivent correspondre au nom Blender de l'objet (object.name — voir
    // objects/CLAUDE.md). Un nouvel objet n'a besoin d'aucune entrée pour fonctionner —
    // computeAutoFocus() se trompe pour un objet très plat/large, très petit, ou dont
    // l'approche par défaut n'est pas pertinente : dans ce cas, calibrer le focus ici à la
    // main (par capture d'écran).
  },
};
