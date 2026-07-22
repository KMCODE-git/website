import type { PortfolioEntry } from "../data/scenes";

export interface AccessibleNav {
  setEntries: (entries: Record<string, PortfolioEntry>) => void;
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
        // Contrairement au panneau visuel (ui/panel.ts), un bouton sans libellé serait
        // inutilisable au clavier/lecteur d'écran — repli sur l'id uniquement ici.
        button.textContent = entry.title || entry.id;
        button.addEventListener("click", () => onSelect(entry.id));
        nav.appendChild(button);
      }
    },
  };
}
