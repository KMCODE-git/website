import type { SceneBuilder } from "./types";
import { buildOfficeScene } from "./office";

export type { SceneAssets, SceneBuilder } from "./types";

export const SCENE_BUILDERS: Record<string, SceneBuilder> = {
  office: buildOfficeScene,
};
