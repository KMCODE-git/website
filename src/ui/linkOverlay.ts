import type { LinkTemplate } from "../data/links";
import { createContactForm } from "./contactForm";
import { translate } from "../i18n/translate";

export interface LinkOverlay {
  open: (template: LinkTemplate) => void;
  close: () => void;
  isOpen: () => boolean;
}

interface SubOverlay {
  backdrop: HTMLDivElement;
  panel: HTMLElement;
}

// Chaque gabarit a son propre backdrop/panel — pas un seul élément partagé avec des classes
// basculées. Essayé d'abord en réutilisant un seul élément (classes `--side`/`--page` togglées
// dans open()) : la transition CSS de la PREMIÈRE ouverture d'un gabarit après avoir fermé
// l'autre repartait du transform de l'ancien gabarit (translateX pour "side" vs scale/opacity
// pour "page", incompatibles) et jouait la mauvaise animation — même avec un reset explicite +
// reflow forcé avant réouverture n'a pas suffi à le corriger. Deux éléments distincts, jamais
// réutilisés entre gabarits, éliminent la classe de bug entièrement — chacun a son propre état
// "fermé" constant, sa transition ne dépend jamais de ce qui a été ouvert avant. "form" (contact)
// suit la même règle : structure DOM différente (formulaire, pas un simple title/body), jamais
// partagée avec "side" (utilisé par hobbies).
function createBaseOverlay(typeClass: string): SubOverlay {
  const backdrop = document.createElement("div");
  backdrop.className = `link-overlay ${typeClass}`;
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.inert = true;

  const panel = document.createElement("aside");
  panel.className = "link-overlay__panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  return { backdrop, panel };
}

function hideSubOverlay(overlay: SubOverlay): void {
  overlay.backdrop.classList.remove("link-overlay--visible");
  overlay.backdrop.setAttribute("aria-hidden", "true");
  overlay.backdrop.inert = true;
}

// - "side" : bandeau à droite occupant 1/3 de l'écran ; le fond flouté reste visible tout autour
//   et se ferme au clic dessus (même convention que la sortie de zoom, CLAUDE.md racine).
// - "form" (contact) : même comportement de fermeture que "side" (clic sur le fond ou Échap, pas
//   de caméra impliquée) mais un contenu entièrement dédié (formulaire, voir contactForm.ts) —
//   jamais rendu dans le panel "side" générique, voir commentaire sur createBaseOverlay().
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

  const side = createBaseOverlay("link-overlay--side");
  const sideTitle = document.createElement("h2");
  sideTitle.className = "link-overlay__title";
  const sideBody = document.createElement("p");
  sideBody.className = "link-overlay__body";
  side.panel.append(sideTitle, sideBody);
  side.backdrop.addEventListener("click", (event) => {
    if (event.target === side.backdrop) close();
  });

  const form = createBaseOverlay("link-overlay--form");
  form.panel.classList.add("link-overlay__panel--form");
  const formTitle = document.createElement("h2");
  formTitle.className = "contact-form__title";
  formTitle.textContent = translate("contact.title").primary;
  const formDivider = document.createElement("div");
  formDivider.className = "contact-form__divider";
  formDivider.setAttribute("aria-hidden", "true");
  form.panel.append(formTitle, formDivider, createContactForm());
  form.backdrop.addEventListener("click", (event) => {
    if (event.target === form.backdrop) close();
  });

  const page = createBaseOverlay("link-overlay--page");
  const pageTitle = document.createElement("h2");
  pageTitle.className = "link-overlay__title";
  const pageBody = document.createElement("p");
  pageBody.className = "link-overlay__body";
  page.panel.append(pageTitle, pageBody);
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "link-overlay__close";
  closeButton.setAttribute("aria-label", "Fermer");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => onCloseRequest());
  page.panel.prepend(closeButton);

  return {
    open(template) {
      const overlay = template.type === "page" ? page : template.type === "form" ? form : side;
      if (template.type === "side") {
        sideTitle.textContent = template.title ?? "";
        sideBody.textContent = template.body ?? "";
      } else if (template.type === "page") {
        pageTitle.textContent = template.title ?? "";
        pageBody.textContent = template.body ?? "";
      }
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
