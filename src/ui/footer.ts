import { translate, onLanguageChange } from "../i18n/translate";

// Copyright fixe en bas de l'écran, centré — même esprit que ui/heroText.ts (décoratif,
// pointer-events: none, une seule instance créée au démarrage, se retraduit en place via
// onLanguageChange() plutôt que d'être reconstruit). Année calculée (pas figée en dur) : seule
// la mention "tous droits réservés" est traduite, "© <année> KMCODE" reste identique dans les
// deux langues.
export function createFooter(): void {
  const footer = document.createElement("p");
  footer.className = "site-footer";

  function render() {
    footer.textContent = `© ${new Date().getFullYear()} KMCODE — ${translate("footer.copyright")}`;
  }
  render();
  onLanguageChange(render);

  document.body.appendChild(footer);
}
