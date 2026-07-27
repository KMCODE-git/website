// Page de blocage plein écran affichée sur mobile/tactile (voir deviceCapabilities.ts) — appelée
// à la place de startApp() (main.ts), jamais en plus : aucun modèle 3D n'est chargé, aucun
// contexte WebGL créé. Voir CLAUDE.md racine, "Crash mobile" — les mitigations précédentes
// (pixel ratio réduit, ombres/bloom coupés) n'ont pas suffi à garantir la stabilité partout,
// retour à une page de blocage simple plutôt que de continuer à ajuster au cas par cas.
export function showMobileBlocker(): void {
  const root = document.createElement("div");
  root.className = "mobile-blocker";

  const message = document.createElement("p");
  message.className = "mobile-blocker__message";
  message.textContent = "Only available on desktop for the moment";

  root.appendChild(message);
  document.body.appendChild(root);
}
