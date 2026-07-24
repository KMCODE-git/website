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
import { createAccessibleNav } from "./ui/accessibleNav";
import { createLoadingUi } from "./ui/loading";
import { sceneConfig, type FocusEntry } from "./data/scenes";

const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;

const scene = createScene();
const camera = createCamera();
const renderer = createRenderer(canvas);
const composer = createPostprocessing(renderer, scene, camera);
const cameraRig = createCameraRig(camera);
const parallaxRig = createParallaxRig(camera, canvas);
const objectAnimations = createObjectAnimations();
const loadingUi = createLoadingUi();

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
  cameraRig.reset(sceneConfig.defaultCamera, () => {
    isAnimating = false;
    activeId = null;
    parallaxRig.setEnabled(true);
  });
}

function selectEntry(id: string) {
  if (isAnimating || activeId !== null) return;
  const object = currentObjectsById.get(id);
  if (!object) return;

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

  const { group, interactiveObjects: allInteractiveObjects } = await buildOfficeScene();
  scene.add(group);
  currentAllInteractiveObjects = allInteractiveObjects;

  parallaxRig.setBase(defaultCameraPosition, defaultCameraTarget);
  cameraRig.setCurrentTarget(defaultCameraTarget);

  // Un objet portant userData.animation===true (Custom Property Blender) fonctionne déjà sans
  // entrée dans data/scenes.ts : focus auto-calculé, identifié par son object.name. entries ne
  // sert qu'à surcharger ce résultat (voir objects/resolveEntries.ts).
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

  loadingUi.hide();
}

// Pont dev-only pour scripts/scaffold-scenes.mjs (voir objects/CLAUDE.md) : liste tous les
// objets portant userData.animation===true — permet au script de détecter les noms dupliqués
// et si le focus vient d'une surcharge ou de l'auto.
if (import.meta.env.DEV) {
  interface ScaffoldObjectInfo {
    name: string;
    animationType: string | null;
    animationTrigger: string | null;
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
          center: center.toArray() as [number, number, number],
          size: size.toArray() as [number, number, number],
        };
      }),
  };
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeActive();
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
