import "./style.css";
import { Box3, Vector3, type Object3D } from "three";
import { createScene } from "./scene";
import { createCamera, handleCameraResize } from "./camera";
import { createRenderer, handleRendererResize } from "./renderer";
import { createLighting } from "./lighting";
import { createPostprocessing, handlePostprocessingResize } from "./postprocessing";
import { buildOfficeScene } from "./objects/scenes/office";
import { resolveEntries } from "./objects/resolveEntries";
import { createPointerPicker } from "./interactions/raycaster";
import { createCameraRig } from "./interactions/cameraRig";
import { createParallaxRig } from "./interactions/parallax";
import { createObjectAnimations } from "./interactions/objectAnimations";
import { prepareSceneEntrance, playSceneEntrance } from "./interactions/sceneEntrance";
import { createAccessibleNav } from "./ui/accessibleNav";
import { createLoadingUi } from "./ui/loading";
import { createLinkOverlay } from "./ui/linkOverlay";
import { computeAutoFocus } from "./objects/autoFocus";
import { sceneConfig, type FocusEntry } from "./data/scenes";
import { linkTemplates } from "./data/links";

// Fraction de remplissage bien plus élevée que le zoom standard (0.75, voir autoFocus.ts) pour
// le gabarit "page" de link : effet recherché "on rentre dans l'objet", pas juste "on regarde
// l'objet de près". Reste au-dessus de camera.near (0.1, camera.ts) pour un objet de la taille
// de Mac — à revoir si un futur link="page" porte sur un objet beaucoup plus petit.
const LINK_PAGE_ZOOM_FILL_FRACTION = 3.5;

const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;

const scene = createScene();
const camera = createCamera();
const renderer = createRenderer(canvas);
const composer = createPostprocessing(renderer, scene, camera);
const cameraRig = createCameraRig(camera);
const parallaxRig = createParallaxRig(camera, canvas);
const objectAnimations = createObjectAnimations();
const loadingUi = createLoadingUi();
// closeActive référencée avant sa déclaration textuelle plus bas : `function` est hoisté, donc
// déjà disponible ici (l'appel ne se fait qu'au clic sur le bouton fermer, pas à la création).
const linkOverlay = createLinkOverlay(() => closeActive());

const { group: lightingGroup } = createLighting();
scene.add(lightingGroup);

const defaultCameraPosition = new Vector3(...sceneConfig.defaultCamera.position);
const defaultCameraTarget = new Vector3(...sceneConfig.defaultCamera.target);

let activeId: string | null = null;
let isAnimating = false;
let hoveredObject: Object3D | null = null;
let currentEntries: Record<string, FocusEntry> = {};
let currentObjectsById: Map<string, Object3D> = new Map();
let currentAllInteractiveObjects: Object3D[] = [];

function setHovered(object: Object3D | null) {
  if (hoveredObject === object) return;
  hoveredObject = object;
  canvas.style.cursor = object ? "pointer" : "default";
  objectAnimations.setHovered(object);
  // "zoom" reste déclenché uniquement au clic quel que soit animationTrigger (voir CLAUDE.md
  // racine, "Interaction et caméra") — le survol-lift ci-dessus reste actif dans tous les cas.
  if (object && object.userData.animationTrigger === "hover" && object.userData.animationType !== "zoom") {
    objectAnimations.trigger(object, object.userData.animationType as string | undefined);
  }
}

function closeActive() {
  if (activeId === null || isAnimating) return;
  isAnimating = true;
  // Ferme d'abord l'overlay "page" éventuellement ouvert (voir openLink()) — avant que la
  // caméra ne commence à dézoomer, pour ne pas voir le contenu plein écran pendant le tween.
  // No-op si aucun overlay n'est ouvert (ex. simple animationType="zoom" sans link).
  linkOverlay.close();
  cameraRig.reset(sceneConfig.defaultCamera, () => {
    isAnimating = false;
    activeId = null;
    parallaxRig.setEnabled(true);
  });
}

// "link" (Custom Property Blender) rend un objet cliquable à lui seul, indépendamment de
// "animation"/"animationTrigger" — un simple clic suffit toujours (voir CLAUDE.md racine).
// Renvoie true si l'objet portait un link (traité ou signalé manquant/non géré), pour que
// selectEntry() n'enchaîne pas ensuite sur la logique zoom/animationType habituelle.
function openLink(object: Object3D): boolean {
  const linkId = object.userData.link as string | undefined;
  if (!linkId) return false;

  const template = linkTemplates[linkId];
  if (!template) {
    console.warn(`"${object.name}" a link="${linkId}" mais aucun template n'existe pour cette valeur (voir data/links.ts).`);
    return true;
  }

  if (template.type === "side") {
    setHovered(null);
    linkOverlay.open(template);
    return true;
  }

  // "page" : zoom caméra max préalable dans l'objet — pas le cadrage standard (currentEntries,
  // fillFraction 0.75 utilisé par animationType="zoom") mais un cadrage dédié bien plus serré
  // (LINK_PAGE_ZOOM_FILL_FRACTION) pour l'effet "on rentre dedans". Même mécanique que
  // animationType="zoom" par ailleurs (activeId/isAnimating, pour que closeActive() sache
  // dézoomer) — la page ne s'affiche qu'une fois le zoom terminé (onComplete), en fondu (voir
  // .link-overlay--page dans style.css), pas simultanément au zoom.
  const focus = computeAutoFocus(object, camera.fov, defaultCameraPosition, LINK_PAGE_ZOOM_FILL_FRACTION);
  setHovered(null);
  activeId = object.name;
  isAnimating = true;
  parallaxRig.setEnabled(false);
  cameraRig.focus(focus, () => {
    isAnimating = false;
    linkOverlay.open(template);
  });
  return true;
}

function selectEntry(id: string) {
  if (isAnimating || activeId !== null) return;
  const object = currentObjectsById.get(id);
  if (!object) return;

  if (openLink(object)) return;

  if (object.userData.animationType === "zoom") {
    const entry = currentEntries[id];
    if (!entry) return;
    setHovered(null);
    activeId = id;
    isAnimating = true;
    parallaxRig.setEnabled(false);
    cameraRig.focus(entry.focus, () => {
      isAnimating = false;
    });
    return;
  }

  // Les autres animationType (swing/swing_back/spin/bounce/move) ne déclenchent au clic que si
  // animationTrigger="click" (Custom Property Blender) — sinon c'est le survol qui s'en charge,
  // voir setHovered() ci-dessus.
  if (object.userData.animationTrigger === "click") {
    objectAnimations.trigger(object, object.userData.animationType as string | undefined);
  }
}

const accessibleNav = createAccessibleNav(selectEntry);

async function init(): Promise<void> {
  loadingUi.show();

  const { group, model, interactiveObjects: allInteractiveObjects } = await buildOfficeScene();
  scene.add(group);
  currentAllInteractiveObjects = allInteractiveObjects;

  // Précompile les shaders de tous les matériaux de la scène avant de révéler quoi que ce soit
  // (encore masqué par l'écran de chargement à ce stade).
  renderer.compile(scene, camera);

  parallaxRig.setBase(defaultCameraPosition, defaultCameraTarget);
  cameraRig.setCurrentTarget(defaultCameraTarget);

  // Un objet portant userData.animation===true (Custom Property Blender) fonctionne déjà sans
  // entrée dans data/scenes.ts : focus auto-calculé, identifié par son object.name. entries ne
  // sert qu'à surcharger ce résultat (voir objects/resolveEntries.ts). Doit impérativement
  // s'exécuter AVANT prepareSceneEntrance() ci-dessous : computeAutoFocus() lit la bounding box
  // courante de chaque objet, qui doit encore être sa position de repos, pas déjà déplacée vers
  // sa position "cachée" de l'animation d'arrivée (bug vécu : le focus de zoom visait la
  // position élevée d'avant-chute plutôt que la position finale de l'objet).
  const { entries, interactiveObjects } = resolveEntries(allInteractiveObjects, sceneConfig.entries, camera.fov, defaultCameraPosition);

  currentObjectsById = new Map(interactiveObjects.map((object) => [object.name, object]));
  createPointerPicker(camera, canvas, interactiveObjects, {
    onHover(id) {
      if (activeId !== null || isAnimating) return;
      setHovered(id ? (currentObjectsById.get(id) ?? null) : null);
    },
    onClick(id) {
      if (isAnimating) return;
      if (activeId === null) {
        if (id) selectEntry(id);
      } else {
        closeActive();
      }
    },
  });

  currentEntries = entries;
  accessibleNav.setEntries(entries);

  // Rendu complet "à blanc" (encore masqué derrière l'écran de chargement), PENDANT que tous les
  // objets sont encore à leur position de repos normale (visible/dans le champ de la caméra) —
  // renderer.compile() ne fait que compiler les shaders (voir plus haut), pas initialiser les
  // framebuffers de shadow map/bloom NI uploader les textures des objets : Three.js n'uploade la
  // texture d'un objet que la première fois qu'il est réellement rendu (pas frustum-culled).
  // Volontairement AVANT prepareSceneEntrance() ci-dessous : si ce rendu avait lieu après avoir
  // déjà déplacé les objets hors-champ pour l'animation d'arrivée, chacun se retrouverait
  // frustum-culled pendant ce rendu et son upload de texture serait reporté au moment où il
  // entre réellement dans le champ pendant la chute — étalant ces uploads coûteux sur toute la
  // durée de l'animation au lieu de les regrouper ici, cachés derrière l'écran de chargement
  // (bug vécu et confirmé via trace WebGL : gl.texSubImage2D() se déclenchait au fil de la chute).
  composer.render();

  // Positionne déjà tout hors-champ (murs glissés, sol descendu, items élevés) ici, pendant que
  // l'écran de chargement masque encore tout — playSceneEntrance() plus bas ne fera plus que
  // démarrer l'horloge du tween, rien de plus, pile au moment de la révélation. Volontairement
  // après resolveEntries() ET composer.render() ci-dessus (voir leurs commentaires).
  const sceneEntrancePlan = prepareSceneEntrance(model);

  loadingUi.hide();
  // Ombres recalculées à chaque frame par défaut (renderer.shadowMap.autoUpdate) — coûteux avec
  // ~24 objets qui bougent simultanément pendant l'arrivée, suspecté responsable des saccades.
  // Coupé le temps de l'animation, un seul recalcul forcé une fois tout stabilisé.
  renderer.shadowMap.autoUpdate = false;
  playSceneEntrance(sceneEntrancePlan, () => {
    renderer.shadowMap.autoUpdate = true;
    renderer.shadowMap.needsUpdate = true;
  });
}

// Pont dev-only pour scripts/scaffold-scenes.mjs (voir objects/CLAUDE.md) : liste tous les
// objets interactifs (userData.animation===true et/ou userData.link) — permet au script de
// détecter les noms dupliqués et si le focus vient d'une surcharge ou de l'auto.
if (import.meta.env.DEV) {
  interface ScaffoldObjectInfo {
    name: string;
    animationType: string | null;
    animationTrigger: string | null;
    link: string | null;
    center: [number, number, number];
    size: [number, number, number];
  }
  (window as unknown as { __kmcode_scaffold__: { listInteractiveObjects: () => ScaffoldObjectInfo[] } }).__kmcode_scaffold__ = {
    listInteractiveObjects: () =>
      currentAllInteractiveObjects.map((object) => {
        const box = new Box3().setFromObject(object);
        const center = box.getCenter(new Vector3());
        const size = box.getSize(new Vector3());
        return {
          name: object.name,
          animationType: (object.userData.animationType as string | undefined) ?? null,
          animationTrigger: (object.userData.animationTrigger as string | undefined) ?? null,
          link: (object.userData.link as string | undefined) ?? null,
          center: center.toArray() as [number, number, number],
          size: size.toArray() as [number, number, number],
        };
      }),
  };
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeActive();
  linkOverlay.close();
});

window.addEventListener("resize", () => {
  handleCameraResize(camera);
  handleRendererResize(renderer);
  handlePostprocessingResize(composer);
});

function animate() {
  requestAnimationFrame(animate);
  parallaxRig.update();
  objectAnimations.update();
  composer.render();
}

animate();
void init();
