import type { FocusEntry } from "../data/scenes";

export interface AccessibleNav {
  setEntries: (entries: Record<string, FocusEntry>) => void;
}

export function createAccessibleNav(onSelect: (id: string) => void): AccessibleNav {
  const nav = document.createElement("nav");
  nav.className = "sr-nav";
  nav.setAttribute("aria-label", "Sections de la scène");
  document.body.appendChild(nav);

  return {
    setEntries(entries) {
      nav.innerHTML = "";
      for (const entry of Object.values(entries)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sr-nav__button";
        // Plus de titre Blender à afficher (panneau de contenu retiré) : l'id est le seul
        // libellé disponible pour ce fallback clavier — un bouton sans texte serait
        // inutilisable au clavier/lecteur d'écran.
        button.textContent = entry.id;
        button.addEventListener("click", () => onSelect(entry.id));
        nav.appendChild(button);
      }
    },
  };
}
