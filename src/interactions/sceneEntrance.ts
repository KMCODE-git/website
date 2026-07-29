import * as THREE from "three";

// Ease-out (rapide au début, ralentit en approchant du sol), même hauteur et même durée pour
// tous les objets — seul le délai de départ change d'un objet à l'autre, pour une arrivée en
// cascade par vagues plutôt qu'un mouvement individuellement randomisé.
const ITEM_DROP_HEIGHT = 8;
const ITEM_FALL_DURATION_MS = 850;

// Vagues, dans l'ordre : mobilier, puis petits objets — voir CLAUDE.md racine pour le détail de
// ce découpage (catégorisation par défaut, à ajuster si besoin).
const FURNITURE_BASE_DELAY_MS = 200;
const FURNITURE_STEP_MS = 20;
const OBJECTS_BASE_DELAY_MS = 300;
const OBJECTS_STEP_MS = 20;

// Objets "meubles" du setup de bureau actuel (office_lite.glb) — les autres (Mac, iPhone,
// Keyboard, Coffee, PS5, AirpodsMax, Apple_watch...) tombent dans la vague "petits objets" par
// défaut (voir plus bas).
const FURNITURE_NAMES = new Set(["Desk", "Chair", "Plant", "Lamp"]);

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface LinearDrop {
  object: THREE.Object3D;
  restY: number;
  delay: number;
}

export interface SceneEntrancePlan {
  drops: LinearDrop[];
}

// Calcule le plan d'animation et élève déjà tous les objets hors-champ — à appeler juste après
// le chargement du modèle, PENDANT que l'écran de chargement masque encore tout (voir main.ts,
// init()). Sépare volontairement le calcul/la mise en position (parcours des enfants) du
// lancement du tween (playSceneEntrance ci-dessous) : si les deux se faisaient au même moment
// que loadingUi.hide(), ce travail s'intercalerait pile au moment de la révélation et casserait
// la fluidité — ici, tout est déjà prêt et hors-champ bien avant, il ne reste plus qu'à démarrer
// l'horloge du tween au bon moment.
export function prepareSceneEntrance(model: THREE.Object3D): SceneEntrancePlan {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return { drops: [] };

  let objectIndex = 0;
  let furnitureIndex = 0;
  const drops: LinearDrop[] = model.children.map((object) => {
    let delay: number;
    if (FURNITURE_NAMES.has(object.name)) {
      delay = FURNITURE_BASE_DELAY_MS + furnitureIndex * FURNITURE_STEP_MS;
      furnitureIndex++;
    } else {
      delay = OBJECTS_BASE_DELAY_MS + objectIndex * OBJECTS_STEP_MS;
      objectIndex++;
    }
    return { object, restY: object.position.y, delay };
  });
  for (const drop of drops) {
    drop.object.position.y = drop.restY + ITEM_DROP_HEIGHT;
  }

  return { drops };
}

// Démarre le tween à partir du plan déjà calculé/positionné par prepareSceneEntrance() — à
// appeler juste après loadingUi.hide(). Ne fait plus aucun calcul lourd à cet instant précis,
// seulement la boucle d'animation elle-même (même pattern que interactions/cameraRig.ts : tween
// via son propre requestAnimationFrame, indépendant de la boucle animate() de main.ts).
// onComplete (optionnel) est appelé une fois tous les tweens terminés — main.ts s'en sert pour
// réactiver les ombres desactivées pendant la durée de l'animation, voir plus bas.
export function playSceneEntrance(plan: SceneEntrancePlan, onComplete?: () => void): void {
  const { drops } = plan;
  if (drops.length === 0) {
    onComplete?.();
    return;
  }

  const startTime = performance.now();

  function step(now: number) {
    const elapsedTotal = now - startTime;
    let stillActive = false;

    for (const drop of drops) {
      const localElapsed = elapsedTotal - drop.delay;
      if (localElapsed <= 0) {
        stillActive = true;
        continue;
      }
      // Ease-out : même hauteur/durée pour tous les items, seul le délai de départ crée la
      // cascade.
      const u = Math.min(localElapsed / ITEM_FALL_DURATION_MS, 1);
      drop.object.position.y = drop.restY + ITEM_DROP_HEIGHT * (1 - easeOutCubic(u));
      if (u < 1) stillActive = true;
    }

    if (stillActive) requestAnimationFrame(step);
    else onComplete?.();
  }

  requestAnimationFrame(step);
}
