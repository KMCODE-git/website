export interface LoadingUi {
  show: () => void;
  hide: () => void;
}

export function createLoadingUi(): LoadingUi {
  const root = document.createElement("div");
  root.className = "loading";
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("role", "status");
  root.innerHTML = `<div class="loading__spinner"></div><p class="loading__label">Chargement de la scène…</p>`;
  document.body.appendChild(root);

  return {
    show() {
      root.classList.add("loading--visible");
      root.setAttribute("aria-hidden", "false");
    },
    hide() {
      root.classList.remove("loading--visible");
      root.setAttribute("aria-hidden", "true");
    },
  };
}
