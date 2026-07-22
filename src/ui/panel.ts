import type { PortfolioEntry } from "../data/scenes";

export interface Panel {
  show: (entry: PortfolioEntry) => void;
  hide: () => void;
  onClose: (handler: () => void) => void;
}

export function createPanel(root: HTMLElement): Panel {
  let closeHandler: (() => void) | null = null;

  root.innerHTML = `
    <button class="panel__close" type="button" aria-label="Fermer">&times;</button>
    <h2 class="panel__title"></h2>
    <div class="panel__body">
      <p class="panel__description"></p>
      <ul class="panel__links"></ul>
    </div>
  `;

  const closeButton = root.querySelector<HTMLButtonElement>(".panel__close")!;
  const title = root.querySelector<HTMLHeadingElement>(".panel__title")!;
  const description = root.querySelector<HTMLParagraphElement>(".panel__description")!;
  const linksList = root.querySelector<HTMLUListElement>(".panel__links")!;

  closeButton.addEventListener("click", () => closeHandler?.());
  root.inert = true;

  return {
    show(entry) {
      // Pas de repli sur l'id : un objet sans titre Blender n'affiche simplement pas de titre.
      title.textContent = entry.title;
      title.style.display = entry.title ? "" : "none";
      description.textContent = entry.description;
      linksList.innerHTML = entry.links
        .map((link) => `<li><a href="${link.href}" target="_blank" rel="noopener">${link.label}</a></li>`)
        .join("");
      root.classList.add("panel--visible");
      root.setAttribute("aria-hidden", "false");
      root.inert = false;
    },
    hide() {
      root.classList.remove("panel--visible");
      root.setAttribute("aria-hidden", "true");
      root.inert = true;
    },
    onClose(handler) {
      closeHandler = handler;
    },
  };
}
