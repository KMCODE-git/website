import { Box3, Vector3, type Object3D } from "three";

interface ScaffoldObjectInfo {
  name: string;
  animationType: string | null;
  animationTrigger: string | null;
  link: string | null;
  center: [number, number, number];
  size: [number, number, number];
}

// Pont dev-only pour scripts/scaffold-scenes.mjs (voir objects/CLAUDE.md) : liste tous les
// objets interactifs (userData.animation===true et/ou userData.link) — permet au script de
// détecter les noms dupliqués et si le focus vient d'une surcharge ou de l'auto. À appeler
// uniquement sous `if (import.meta.env.DEV)` côté appelant : jamais présent dans le bundle de
// production.
export function installScaffoldBridge(getInteractiveObjects: () => Object3D[]): void {
  (window as unknown as { __kmcode_scaffold__: { listInteractiveObjects: () => ScaffoldObjectInfo[] } }).__kmcode_scaffold__ = {
    listInteractiveObjects: () =>
      getInteractiveObjects().map((object) => {
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
