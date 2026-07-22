import * as THREE from "three";
import { computeAutoFocus } from "./autoFocus";
import { translate } from "../i18n/translate";
import type { PortfolioEntry, PortfolioEntryOverride } from "../data/scenes";

export interface ResolvedEntries {
  entries: Record<string, PortfolioEntry>;
  interactiveObjects: THREE.Object3D[];
}

// Fusionne, pour chaque objet portant un userData.id : title/description viennent toujours
// de Blender (Custom Properties, traduites via i18n/translate.ts — voir son commentaire),
// data/scenes.ts ne sert plus qu'à surcharger le focus ou ajouter des liens. Un objet
// fonctionne donc sans aucune entrée dans data/scenes.ts. Pas de titre Blender → title vide,
// pas de repli sur l'id (voir ui/panel.ts et ui/accessibleNav.ts pour ce que ça implique).
// Un id posé sur plusieurs objets est ambigu — on l'exclut avec un avertissement plutôt
// que de deviner lequel garder (voir "npm run scaffold" pour les repérer en amont).
export function resolveEntries(
  objects: THREE.Object3D[],
  overrides: Record<string, PortfolioEntryOverride> | undefined,
  cameraFovDegrees: number,
  defaultCameraPosition: THREE.Vector3
): ResolvedEntries {
  const byId = new Map<string, THREE.Object3D[]>();
  for (const object of objects) {
    const id = object.userData.id as string | undefined;
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id)!.push(object);
  }

  const entries: Record<string, PortfolioEntry> = {};
  const interactiveObjects: THREE.Object3D[] = [];

  for (const [id, group] of byId) {
    if (group.length > 1) {
      console.warn(
        `[data/scenes] "${id}" est posé sur ${group.length} objets différents (${group
          .map((object) => object.name)
          .join(", ")}) — ignoré. Chaque objet doit avoir un id unique (voir objects/CLAUDE.md, "npm run scaffold" pour les repérer).`
      );
      continue;
    }

    const object = group[0];
    const override = overrides?.[id];
    entries[id] = {
      id,
      title: translate(object.userData.title as string | undefined) ?? "",
      description: translate(object.userData.description as string | undefined) ?? "",
      links: override?.links ?? [],
      focus: override?.focus ?? computeAutoFocus(object, cameraFovDegrees, defaultCameraPosition),
    };
    interactiveObjects.push(object);
  }

  return { entries, interactiveObjects };
}
