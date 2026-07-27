export interface SiteMenuEntry {
  id: string;
  label: string;
}

export interface SiteMenu {
  close: () => void;
  isOpen: () => boolean;
}

const DOTS_ICON = `<span class="site-menu__dot"></span><span class="site-menu__dot"></span><span class="site-menu__dot"></span>`;
const CLOSE_ICON = `<span class="site-menu__close-icon" aria-hidden="true">&times;</span>`;

// Menu fixe (coin haut-gauche), `position: fixed` — jamais affecté par le décalage de parallaxe
// (interactions/parallax.ts), qui ne bouge que la caméra 3D, jamais le DOM. Donne un accès direct
// aux mêmes pages de contenu que les objets "link" de la scène (voir data/links.ts) sans devoir
// chercher/cliquer l'objet correspondant en 3D — `onSelect(id)` est appelé avec la même clé que
// `object.userData.link`, câblé côté main.ts vers `activateLink()`.
export function createSiteMenu(entries: SiteMenuEntry[], onSelect: (id: string) => void): SiteMenu {
  let open = false;

  const root = document.createElement("div");
  root.className = "site-menu";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "site-menu__toggle";
  toggle.setAttribute("aria-haspopup", "true");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Menu");
  toggle.innerHTML = DOTS_ICON;

  const panel = document.createElement("nav");
  panel.className = "site-menu__panel";
  panel.setAttribute("aria-label", "Navigation");
  panel.inert = true;

  for (const entry of entries) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "site-menu__item";
    const label = document.createElement("span");
    label.textContent = entry.label;
    const arrow = document.createElement("span");
    arrow.className = "site-menu__arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    item.append(label, arrow);
    item.addEventListener("click", () => {
      close();
      onSelect(entry.id);
    });
    panel.appendChild(item);
  }

  root.append(toggle, panel);
  document.body.appendChild(root);

  function close() {
    if (!open) return;
    open = false;
    root.classList.remove("site-menu--open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = DOTS_ICON;
    panel.inert = true;
  }

  function show() {
    if (open) return;
    open = true;
    root.classList.add("site-menu--open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.innerHTML = CLOSE_ICON;
    panel.inert = false;
  }

  toggle.addEventListener("click", () => (open ? close() : show()));

  // Clic n'importe où en dehors du menu (canvas compris) le referme — même convention que le
  // gabarit "side" de link-overlay.ts (clic sur le fond flouté).
  document.addEventListener("pointerdown", (event) => {
    if (!open || root.contains(event.target as Node)) return;
    close();
  });

  return { close, isOpen: () => open };
}
