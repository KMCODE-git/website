import * as THREE from "three";
import { computeAutoFocus } from "./autoFocus";
import type { FocusEntry, FocusOverride } from "../data/scenes";

export interface ResolvedEntries {
  entries: Record<string, FocusEntry>;
  interactiveObjects: THREE.Object3D[];
}

// Pour chaque objet portant userData.animation===true : calcule son focus caméra (auto via
// objects/autoFocus.ts, ou surchargé dans data/scenes.ts si le résultat par défaut ne convient
// pas). `object.name` (déjà unique par objet dans Blender) sert de clé — aucune Custom
// Property "id" à poser. Un nom posé sur plusieurs objets serait ambigu (ne devrait pas
// arriver, Blender garantit des noms uniques) : on l'exclut alors avec un avertissement plutôt
// que de deviner lequel garder.
export function resolveEntries(
  objects: THREE.Object3D[],
  overrides: Record<string, FocusOverride> | undefined,
  cameraFovDegrees: number,
  defaultCameraPosition: THREE.Vector3
): ResolvedEntries {
  const byName = new Map<string, THREE.Object3D[]>();
  for (const object of objects) {
    if (!byName.has(object.name)) byName.set(object.name, []);
    byName.get(object.name)!.push(object);
  }

  const entries: Record<string, FocusEntry> = {};
  const interactiveObjects: THREE.Object3D[] = [];

  for (const [name, group] of byName) {
    if (group.length > 1) {
      console.warn(
        `[data/scenes] "${name}" est posé sur ${group.length} objets différents — ignoré. Chaque objet interactif doit avoir un nom unique dans Blender (voir objects/CLAUDE.md, "npm run scaffold" pour les repérer).`
      );
      continue;
    }

    const object = group[0];
    const override = overrides?.[name];
    entries[name] = {
      id: name,
      focus: override?.focus ?? computeAutoFocus(object, cameraFovDegrees, defaultCameraPosition),
    };
    interactiveObjects.push(object);
  }

  return { entries, interactiveObjects };
}
