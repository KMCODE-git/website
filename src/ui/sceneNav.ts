import type { SceneMeta } from "../data/scenes";

export interface SceneNav {
  setActive: (sceneId: string) => void;
}

export function createSceneNav(scenes: SceneMeta[], onSelect: (id: string) => void): SceneNav {
  const nav = document.createElement("nav");
  nav.className = "scene-nav";
  nav.setAttribute("aria-label", "Navigation entre les scènes");

  const buttons = new Map<string, HTMLButtonElement>();

  for (const sceneMeta of scenes) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scene-nav__button";
    button.textContent = sceneMeta.label;
    button.addEventListener("click", () => onSelect(sceneMeta.id));
    nav.appendChild(button);
    buttons.set(sceneMeta.id, button);
  }

  document.body.appendChild(nav);

  return {
    setActive(sceneId) {
      for (const [id, button] of buttons) {
        button.classList.toggle("scene-nav__button--active", id === sceneId);
      }
    },
  };
}
