import * as THREE from "three";

interface PointerPickerCallbacks {
  onHover: (name: string | null) => void;
  onClick: (name: string | null) => void;
}

const CLICK_DRAG_THRESHOLD = 6;

function findInteractiveAncestor(object: THREE.Object3D | null): THREE.Object3D | null {
  let current = object;
  while (current) {
    if (current.userData.animation === true) return current;
    current = current.parent;
  }
  return null;
}

export function createPointerPicker(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  interactiveObjects: THREE.Object3D[],
  callbacks: PointerPickerCallbacks
): { dispose: () => void } {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downPos: { x: number; y: number } | null = null;

  function pickNameAt(clientX: number, clientY: number): string | null {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactiveObjects, true);
    if (hits.length === 0) return null;
    const target = findInteractiveAncestor(hits[0].object);
    return target?.name ?? null;
  }

  function handlePointerMove(event: PointerEvent) {
    callbacks.onHover(pickNameAt(event.clientX, event.clientY));
  }

  function handlePointerDown(event: PointerEvent) {
    downPos = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: PointerEvent) {
    if (!downPos) return;
    const dx = event.clientX - downPos.x;
    const dy = event.clientY - downPos.y;
    downPos = null;
    if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD) return;
    callbacks.onClick(pickNameAt(event.clientX, event.clientY));
  }

  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerup", handlePointerUp);

  return {
    dispose() {
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
    },
  };
}
