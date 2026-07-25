import * as THREE from "three";

// "items" (tout sauf Walls/Mur_droite/Mur_fond/Sol) : ease-out (rapide au début, ralentit en
// approchant du sol), même hauteur et même durée pour tous — seul le délai de départ change
// d'un objet à l'autre, pour une arrivée en cascade par vagues plutôt qu'un mouvement
// individuellement randomisé.
const ITEM_DROP_HEIGHT = 8;
const ITEM_FALL_DURATION_MS = 850;

// Murs/sol : easing (pas linéaire comme les items), tous démarrent ensemble avant la première
// vague d'items.
const STRUCTURE_DURATION_MS = 1200;
// Fraction de la longueur du mur — le résultat (~8-9 unités pour ce modèle) doit rester net,
// bien au-delà de la taille de la pièce (~4 unités), pour partir hors du champ visible quelle
// que soit la position de la caméra.
const WALL_SLIDE_FACTOR = 2.2;
const FLOOR_RISE_HEIGHT = 8;

// Vagues, dans l'ordre : tapis, puis mobilier, puis petits objets — voir CLAUDE.md racine pour
// le détail de ce découpage (catégorisation par défaut, à ajuster si besoin).
const TAPIS_DELAY_MS = 150;
const FURNITURE_BASE_DELAY_MS = 200;
const FURNITURE_STEP_MS = 20;
const OBJECTS_BASE_DELAY_MS = 300;
const OBJECTS_STEP_MS = 20;

const FURNITURE_NAMES = new Set(["Mirror", "Triptych", "Low_table", "Shelf", "Desk", "Chair", "Plant_1", "Plant_2", "NeonStrip", "Led_pannels"]);

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface LinearDrop {
  object: THREE.Object3D;
  restY: number;
  delay: number;
}

interface EasedAxisSlide {
  object: THREE.Object3D;
  axis: "x" | "y" | "z";
  restValue: number;
  // Décalage initial ajouté à restValue (position de départ = restValue + offset), animé vers 0.
  offset: number;
}

export interface SceneEntrancePlan {
  structureSlides: EasedAxisSlide[];
  drops: LinearDrop[];
}

// Glisse le long de son axe le plus fin (son épaisseur, donc perpendiculaire à son propre plan)
// — c'est "son côté" au sens où le mur doit entrer dans le champ depuis l'extérieur de la pièce.
// Suppose une chaîne de parents sans rotation/échelle jusqu'à la racine (vrai ici, voir
// interactions/objectAnimations.ts pour la même hypothèse ailleurs dans le projet).
function computeWallSlide(wall: THREE.Object3D): EasedAxisSlide {
  const box = new THREE.Box3().setFromObject(wall);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const axis: "x" | "z" = size.x < size.z ? "x" : "z";
  const runLength = axis === "x" ? size.z : size.x;
  const distance = runLength * WALL_SLIDE_FACTOR;
  // Signe opposé à la position du mur (pas le même signe) : un mur côté Z négatif doit partir
  // du côté Z positif pour glisser "vers" sa position depuis l'extérieur perçu comme son côté,
  // pas s'éloigner encore plus loin dans la même direction (constaté à l'usage sur Mur_droite).
  const sign = -(Math.sign(axis === "x" ? center.x : center.z) || 1);
  const restValue = axis === "x" ? wall.position.x : wall.position.z;
  return { object: wall, axis, restValue, offset: sign * distance };
}

function computeFloorRise(floor: THREE.Object3D): EasedAxisSlide {
  return { object: floor, axis: "y", restValue: floor.position.y, offset: -FLOOR_RISE_HEIGHT };
}

function applyAxisValue(slide: EasedAxisSlide, value: number): void {
  if (slide.axis === "x") slide.object.position.x = value;
  else if (slide.axis === "y") slide.object.position.y = value;
  else slide.object.position.z = value;
}

// Calcule le plan d'animation et positionne déjà tout hors-champ (murs glissés, sol descendu,
// items élevés) — à appeler juste après le chargement du modèle, PENDANT que l'écran de
// chargement masque encore tout (voir main.ts, init()). Sépare volontairement le calcul/la mise
// en position (potentiellement coûteux : Box3 sur les murs, parcours des enfants) du lancement
// du tween (playSceneEntrance ci-dessous) : si les deux se faisaient au même moment que
// loadingUi.hide(), ce travail s'intercalerait pile au moment de la révélation et casserait la
// fluidité — ici, tout est déjà prêt et hors-champ bien avant, il ne reste plus qu'à démarrer
// l'horloge du tween au bon moment.
export function prepareSceneEntrance(model: THREE.Object3D): SceneEntrancePlan {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return { structureSlides: [], drops: [] };

  const wallsGroup = model.children.find((child) => child.name === "Walls");
  const structureSlides: EasedAxisSlide[] = [];
  if (wallsGroup) {
    for (const child of wallsGroup.children) {
      if (child.name === "Sol") structureSlides.push(computeFloorRise(child));
      else structureSlides.push(computeWallSlide(child));
    }
  }
  for (const slide of structureSlides) {
    applyAxisValue(slide, slide.restValue + slide.offset);
  }

  const items = model.children.filter((child) => child.name !== "Walls");
  let objectIndex = 0;
  let furnitureIndex = 0;
  const drops: LinearDrop[] = items.map((object) => {
    let delay: number;
    if (object.name === "Tapis") {
      delay = TAPIS_DELAY_MS;
    } else if (FURNITURE_NAMES.has(object.name)) {
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

  return { structureSlides, drops };
}

// Démarre le tween à partir du plan déjà calculé/positionné par prepareSceneEntrance() — à
// appeler juste après loadingUi.hide(). Ne fait plus aucun calcul lourd à cet instant précis,
// seulement la boucle d'animation elle-même (même pattern que interactions/cameraRig.ts : tween
// via son propre requestAnimationFrame, indépendant de la boucle animate() de main.ts).
// onComplete (optionnel) est appelé une fois tous les tweens terminés — main.ts s'en sert pour
// réactiver les ombres desactivées pendant la durée de l'animation, voir plus bas.
export function playSceneEntrance(plan: SceneEntrancePlan, onComplete?: () => void): void {
  const { structureSlides, drops } = plan;
  if (structureSlides.length === 0 && drops.length === 0) {
    onComplete?.();
    return;
  }

  const startTime = performance.now();

  function step(now: number) {
    const elapsedTotal = now - startTime;
    let stillActive = false;

    for (const slide of structureSlides) {
      const u = Math.min(elapsedTotal / STRUCTURE_DURATION_MS, 1);
      applyAxisValue(slide, slide.restValue + slide.offset * (1 - easeOutCubic(u)));
      if (u < 1) stillActive = true;
    }

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
