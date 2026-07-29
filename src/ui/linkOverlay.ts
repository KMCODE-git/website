import type { LinkTemplate } from "../data/links";
import { createContactForm } from "./contactForm";
import { createAboutPage } from "./aboutPage";
import { createProjectsPage } from "./projectsPage";
import { translate, onLanguageChange } from "../i18n/translate";

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
// et "about" suivent la même règle : structure DOM dédiée, jamais partagée entre elles ni avec
// "side".
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
// - "form" (contact) / "about" : même géométrie et comportement de fermeture que "side" (clic sur
//   le fond ou Échap, pas de caméra impliquée) mais un contenu entièrement dédié (formulaire pour
//   "form", voir contactForm.ts ; portrait/bio/compétences pour "about", voir aboutPage.ts) —
//   jamais rendu dans le panel "side" générique, voir commentaire sur createBaseOverlay(). Les deux
//   partagent le même style visuel sombre/texturé (`.link-overlay__panel--dark`, `style.css`) et
//   le même titre/ligne d'astérisques (`.dark-panel__title`/`.dark-panel__divider`), construits ici
//   plutôt que dans leurs modules de contenu respectifs — seul le texte du titre diffère.
// - "page" : panneau plein écran (posé après un zoom caméra préalable dans l'objet, voir
//   main.ts/openLink()) — pas de "dehors" à cliquer pour fermer. Pas de bouton fermer dédié dans
//   ce module : main.ts (activateLink()) bascule le bouton son (ui/soundToggle.ts) en mode
//   "retour" pendant que ce gabarit est ouvert, voir CLAUDE.md racine "Page Projets" — ce module
//   ne gère que l'ouverture/fermeture locale de l'overlay (close()), jamais le dézoom caméra.
export function createLinkOverlay(): LinkOverlay {
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
  form.panel.classList.add("link-overlay__panel--dark");
  const formTitle = document.createElement("h2");
  formTitle.className = "dark-panel__title";
  const renderFormTitle = () => {
    formTitle.textContent = translate("contact.title");
  };
  renderFormTitle();
  onLanguageChange(renderFormTitle);
  const formDivider = document.createElement("div");
  formDivider.className = "dark-panel__divider";
  formDivider.setAttribute("aria-hidden", "true");
  form.panel.append(formTitle, formDivider, createContactForm());
  form.backdrop.addEventListener("click", (event) => {
    if (event.target === form.backdrop) close();
  });

  const about = createBaseOverlay("link-overlay--about");
  about.panel.classList.add("link-overlay__panel--dark");
  const aboutTitle = document.createElement("h2");
  aboutTitle.className = "dark-panel__title";
  const renderAboutTitle = () => {
    aboutTitle.textContent = translate("about.title");
  };
  renderAboutTitle();
  onLanguageChange(renderAboutTitle);
  const aboutDivider = document.createElement("div");
  aboutDivider.className = "dark-panel__divider";
  aboutDivider.setAttribute("aria-hidden", "true");
  about.panel.append(aboutTitle, aboutDivider, createAboutPage());
  about.backdrop.addEventListener("click", (event) => {
    if (event.target === about.backdrop) close();
  });

  const page = createBaseOverlay("link-overlay--page");
  page.panel.classList.add("link-overlay__panel--page");
  const projectsPage = createProjectsPage();
  page.panel.append(projectsPage.element);

  return {
    open(template) {
      const overlay =
        template.type === "page" ? page : template.type === "form" ? form : template.type === "about" ? about : side;
      if (template.type === "side") {
        sideTitle.textContent = template.title ?? "";
        sideBody.textContent = template.body ?? "";
      } else if (template.type === "page") {
        projectsPage.reset();
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
