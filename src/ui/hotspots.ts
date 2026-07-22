import * as THREE from "three";

interface HotspotTarget {
  id: string;
  position: THREE.Vector3;
  el: HTMLDivElement;
}

export interface Hotspots {
  setTargets: (targets: { id: string; position: THREE.Vector3 }[]) => void;
  setHovered: (id: string | null) => void;
  setVisible: (visible: boolean) => void;
  update: () => void;
}

export function createHotspots(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement): Hotspots {
  const root = document.createElement("div");
  root.className = "hotspots";
  document.body.appendChild(root);

  let targets: HotspotTarget[] = [];
  let hoveredId: string | null = null;
  const projected = new THREE.Vector3();

  return {
    setTargets(newTargets) {
      root.innerHTML = "";
      targets = newTargets.map(({ id, position }) => {
        const el = document.createElement("div");
        el.className = "hotspot";
        el.dataset.id = id;
        root.appendChild(el);
        return { id, position, el };
      });
    },
    setHovered(id) {
      hoveredId = id;
    },
    setVisible(visible) {
      root.classList.toggle("hotspots--hidden", !visible);
    },
    update() {
      if (targets.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      for (const target of targets) {
        projected.copy(target.position).project(camera);
        const behindCamera = projected.z > 1;
        target.el.style.display = behindCamera ? "none" : "block";
        if (behindCamera) continue;
        const x = (projected.x * 0.5 + 0.5) * rect.width;
        const y = (-projected.y * 0.5 + 0.5) * rect.height;
        const scale = target.id === hoveredId ? 1.5 : 1;
        target.el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      }
    },
  };
}
