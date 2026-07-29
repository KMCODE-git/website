export interface SoundToggle {
  isMuted: () => boolean;
  // Bascule ce bouton en "retour" (icône flèche, clic = onClose()) au lieu de mute/unmute — utilisé
  // par main.ts pendant le gabarit link "page" (projects), qui n'a pas de "dehors" cliquable pour
  // fermer (voir CLAUDE.md racine, "Page Projets") : réutilise l'emplacement du bouton son plutôt
  // qu'un bouton fermer dédié en plus. `onClose` omis (ou `active=false`) revient à l'état
  // mute/unmute normal, l'état muted sous-jacent n'est jamais perdu entre les deux.
  setCloseMode: (active: boolean, onClose?: () => void) => void;
}

// Icônes en SVG inline (pas d'emoji, rendu inconsistant selon la plateforme) — traits fins
// (`currentColor`), cohérent avec le style "···"/"×"/"→" déjà utilisé par siteMenu.ts.
const UNMUTED_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 9v6h4l5 4V5L8 9H4z"/>
  <path d="M16.5 8.5a5 5 0 0 1 0 7"/>
  <path d="M19 6a9 9 0 0 1 0 12"/>
</svg>`;
const MUTED_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 9v6h4l5 4V5L8 9H4z"/>
  <line x1="16" y1="9" x2="21" y2="14"/>
  <line x1="21" y1="9" x2="16" y2="14"/>
</svg>`;
const BACK_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M19 12H5"/>
  <path d="M11 18l-6-6 6-6"/>
</svg>`;

// Bouton fixe (coin haut-gauche, même style verre que siteMenu.ts) pour couper/réactiver les
// sons ponctuels (audio/soundEffects.ts). `onToggle(muted)` est appelé à chaque clic — main.ts
// s'en sert pour piloter `soundEffects.setMuted()` (via `THREE.AudioListener.setMasterVolume()`,
// qui coupe tous les sons d'un coup, peu importe combien sont en cours de lecture).
export function createSoundToggle(initialMuted: boolean, onToggle: (muted: boolean) => void): SoundToggle {
  let muted = initialMuted;
  let closeMode = false;
  let onCloseRequest: (() => void) | null = null;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "sound-toggle";

  function render() {
    if (closeMode) {
      button.innerHTML = BACK_ICON;
      button.setAttribute("aria-label", "Fermer");
      button.removeAttribute("aria-pressed");
      return;
    }
    button.innerHTML = muted ? MUTED_ICON : UNMUTED_ICON;
    button.setAttribute("aria-label", muted ? "Activer le son" : "Couper le son");
    button.setAttribute("aria-pressed", String(muted));
  }
  render();

  button.addEventListener("click", () => {
    if (closeMode) {
      onCloseRequest?.();
      return;
    }
    muted = !muted;
    render();
    onToggle(muted);
  });

  document.body.appendChild(button);

  return {
    isMuted: () => muted,
    setCloseMode(active, onClose) {
      closeMode = active;
      onCloseRequest = onClose ?? null;
      render();
    },
  };
}
