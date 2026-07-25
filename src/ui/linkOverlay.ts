import type { LinkTemplate } from "../data/links";

export interface LinkOverlay {
  open: (template: LinkTemplate) => void;
  close: () => void;
  isOpen: () => boolean;
}

interface SubOverlay {
  backdrop: HTMLDivElement;
  panel: HTMLElement;
  title: HTMLHeadingElement;
  body: HTMLParagraphElement;
}

// Chaque gabarit a son propre backdrop/panel — pas un seul élément partagé avec des classes
// basculées. Essayé d'abord en réutilisant un seul élément (classes `--side`/`--page` togglées
// dans open()) : la transition CSS de la PREMIÈRE ouverture d'un gabarit après avoir fermé
// l'autre repartait du transform de l'ancien gabarit (translateX pour "side" vs scale/opacity
// pour "page", incompatibles sur le même élément) et jouait la mauvaise animation — même avec un
// reset explicite + reflow forcé avant reclasse. Deux éléments distincts, jamais réutilisés
// entre gabarits, éliminent la classe de bug entièrement : chacun a son propre état "fermé"
// constant, sa transition ne dépend jamais de ce qui a été ouvert avant.
function createSubOverlay(typeClass: string): SubOverlay {
  const backdrop = document.createElement("div");
  backdrop.className = `link-overlay ${typeClass}`;
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.inert = true;

  const panel = document.createElement("aside");
  panel.className = "link-overlay__panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  const title = document.createElement("h2");
  title.className = "link-overlay__title";
  const body = document.createElement("p");
  body.className = "link-overlay__body";
  panel.append(title, body);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  return { backdrop, panel, title, body };
}

function hideSubOverlay(overlay: SubOverlay): void {
  overlay.backdrop.classList.remove("link-overlay--visible");
  overlay.backdrop.setAttribute("aria-hidden", "true");
  overlay.backdrop.inert = true;
}

// - "side" : bandeau à droite occupant 1/3 de l'écran ; le fond flouté reste visible tout autour
//   et se ferme au clic dessus (même convention que la sortie de zoom, CLAUDE.md racine).
// - "page" : panneau plein écran (posé après un zoom caméra préalable dans l'objet, voir
//   main.ts/openLink()) — pas de "dehors" à cliquer pour fermer, d'où le bouton fermer dédié.
//   Son clic appelle `onCloseRequest` (fourni par main.ts = `closeActive()`) plutôt que fermer en
//   local : "page" implique un zoom caméra actif (activeId côté main.ts) qu'il faut aussi
//   réinitialiser, ce que fermer l'overlay seul ignore complètement.
export function createLinkOverlay(onCloseRequest: () => void): LinkOverlay {
  let open = false;
  let activeOverlay: SubOverlay | null = null;

  function close() {
    if (!open || !activeOverlay) return;
    open = false;
    hideSubOverlay(activeOverlay);
    activeOverlay = null;
  }

  const side = createSubOverlay("link-overlay--side");
  side.backdrop.addEventListener("click", (event) => {
    if (event.target === side.backdrop) close();
  });

  const page = createSubOverlay("link-overlay--page");
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "link-overlay__close";
  closeButton.setAttribute("aria-label", "Fermer");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => onCloseRequest());
  page.panel.prepend(closeButton);

  return {
    open(template) {
      const overlay = template.type === "page" ? page : side;
      overlay.title.textContent = template.title;
      overlay.body.textContent = template.body;
      open = true;
      activeOverlay = overlay;
      overlay.backdrop.classList.add("link-overlay--visible");
      overlay.backdrop.setAttribute("aria-hidden", "false");
      overlay.backdrop.inert = false;
    },
    close,
    isOpen: () => open,
  };
}
