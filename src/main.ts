import "./style.css";
import { Box3, Vector3, type Object3D, type Group } from "three";
import { createScene } from "./scene";
import { createCamera, handleCameraResize } from "./camera";
import { createRenderer, handleRendererResize } from "./renderer";
import { createControls, applyCameraConfig } from "./controls";
import { createLighting } from "./lighting";
import { createPostprocessing, handlePostprocessingResize } from "./postprocessing";
import { SCENE_BUILDERS } from "./objects/scenes";
import { disposeObject3D } from "./objects/loader";
import { resolveEntries } from "./objects/resolveEntries";
import { createPointerPicker } from "./interactions/raycaster";
import { createCameraRig } from "./interactions/cameraRig";
import { createPanel } from "./ui/panel";
import { createAccessibleNav } from "./ui/accessibleNav";
import { createSceneNav } from "./ui/sceneNav";
import { createLoadingUi } from "./ui/loading";
import { createHotspots } from "./ui/hotspots";
import { scenes, type PortfolioEntry } from "./data/scenes";

const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const panelRoot = document.querySelector<HTMLElement>("#panel")!;

const scene = createScene();
const camera = createCamera();
const renderer = createRenderer(canvas);
const controls = createControls(camera, canvas);
const composer = createPostprocessing(renderer, scene, camera);
const cameraRig = createCameraRig(camera, controls);
const panel = createPanel(panelRoot);
const loadingUi = createLoadingUi();
const hotspots = createHotspots(camera, canvas);

const { group: lightingGroup } = createLighting();
scene.add(lightingGroup);

let activeId: string | null = null;
let isAnimating = false;
let hoveredObject: Object3D | null = null;
let activeGroup: Group | null = null;
let disposePicker: (() => void) | null = null;
let currentEntries: Record<string, PortfolioEntry> = {};
let currentObjectsById: Map<string, Object3D> = new Map();
let currentSceneId: string | null = null;
let currentAllInteractiveObjects: Object3D[] = [];

function setHovered(object: Object3D | null) {
  if (hoveredObject === object) return;
  hoveredObject = object;
  canvas.style.cursor = object ? "pointer" : "default";
  hotspots.setHovered(object ? (object.userData.id as string) : null);
}

function closeActive() {
  if (activeId === null || isAnimating) return;
  isAnimating = true;
  panel.hide();
  cameraRig.reset(() => {
    isAnimating = false;
    activeId = null;
    hotspots.setVisible(true);
  });
}

function selectEntry(id: string) {
  if (isAnimating || activeId !== null) return;
  const entry = currentEntries[id];
  if (!entry) return;
  setHovered(null);
  activeId = id;
  isAnimating = true;
  hotspots.setVisible(false);

  cameraRig.focus(entry.focus, () => {
    isAnimating = false;
    panel.show(entry);
  });
}

const accessibleNav = createAccessibleNav(selectEntry);
panel.onClose(closeActive);

async function loadScene(sceneId: string): Promise<void> {
  const meta = scenes.find((candidate) => candidate.id === sceneId);
  if (!meta) return;

  panel.hide();
  setHovered(null);
  activeId = null;
  isAnimating = false;
  hotspots.setVisible(true);

  disposePicker?.();
  disposePicker = null;

  loadingUi.show();

  if (activeGroup) {
    scene.remove(activeGroup);
    disposeObject3D(activeGroup);
    activeGroup = null;
  }

  const { group, interactiveObjects: allInteractiveObjects } = await SCENE_BUILDERS[sceneId]();
  scene.add(group);
  activeGroup = group;
  currentAllInteractiveObjects = allInteractiveObjects;

  applyCameraConfig(camera, controls, meta);

  // Un objet portant un userData.id (Custom Property Blender) fonctionne déjà sans entrée
  // dans data/scenes.ts : title/description viennent de Blender, focus est auto-calculé.
  // meta.entries ne sert qu'à surcharger ce résultat (voir objects/resolveEntries.ts).
  const defaultCameraPosition = new Vector3(...meta.defaultCamera.position);
  const { entries, interactiveObjects } = resolveEntries(
    allInteractiveObjects,
    meta.entries,
    camera.fov,
    defaultCameraPosition
  );

  currentObjectsById = new Map(interactiveObjects.map((object) => [object.userData.id as string, object]));
  hotspots.setTargets(
    interactiveObjects.map((object) => ({
      id: object.userData.id as string,
      position: new Box3().setFromObject(object).getCenter(new Vector3()),
    }))
  );
  const picker = createPointerPicker(camera, canvas, interactiveObjects, {
    onHover(id) {
      if (activeId !== null || isAnimating) return;
      setHovered(id ? (currentObjectsById.get(id) ?? null) : null);
    },
    onClick(id) {
      if (isAnimating) return;
      if (activeId === null) {
        if (id) selectEntry(id);
      }
      // Une fois zoomé, on est dans l'état "interaction" : seul le bouton fermer du panneau
      // (panel.onClose ci-dessous) en sort. Un clic ici (ailleurs ou sur l'objet lui-même) ne
      // fait plus rien pour l'instant — futur point d'accroche pour l'animation déclenchée par
      // clic sur l'objet zoomé (ex. secousse sur une plante, voir Custom Property "interaction").
    },
  });
  disposePicker = picker.dispose;

  currentEntries = entries;
  currentSceneId = sceneId;
  accessibleNav.setEntries(entries);
  sceneNav.setActive(sceneId);

  loadingUi.hide();
}

const sceneNav = createSceneNav(scenes, (id) => {
  if (id === currentSceneId) return;
  void loadScene(id);
});

// Pont dev-only pour scripts/scaffold-scenes.mjs (voir objects/CLAUDE.md) : liste tous les
// objets portant un userData.id dans la scène active (avec ce que Blender fournit déjà comme
// title/description) — permet au script de montrer ce qui est auto-résolu vs à surcharger,
// et de détecter les ids dupliqués.
if (import.meta.env.DEV) {
  interface ScaffoldObjectInfo {
    id: string;
    name: string;
    title: string | null;
    description: string | null;
    center: [number, number, number];
    size: [number, number, number];
  }
  (window as unknown as { __kmcode_scaffold__: { listInteractiveObjects: () => ScaffoldObjectInfo[]; sceneId: () => string | null } }).__kmcode_scaffold__ = {
    listInteractiveObjects: () =>
      currentAllInteractiveObjects.map((object) => {
        const box = new Box3().setFromObject(object);
        const center = box.getCenter(new Vector3());
        const size = box.getSize(new Vector3());
        return {
          id: object.userData.id as string,
          name: object.name,
          title: (object.userData.title as string | undefined) ?? null,
          description: (object.userData.description as string | undefined) ?? null,
          center: center.toArray() as [number, number, number],
          size: size.toArray() as [number, number, number],
        };
      }),
    sceneId: () => currentSceneId,
  };
}

window.addEventListener("resize", () => {
  handleCameraResize(camera);
  handleRendererResize(renderer);
  handlePostprocessingResize(composer);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  hotspots.update();
  composer.render();
}

animate();
void loadScene(scenes[0].id);
