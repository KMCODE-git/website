import { translate, onLanguageChange } from "../i18n/translate";

// Bandeau fixe (bas de l'écran) invitant à passer en paysage — scopé aux appareils tactiles en
// portrait (`(orientation: portrait) and (pointer: coarse)`, pas juste une fenêtre de bureau
// étroite/haute) : la scène est calibrée pour un écran large, un téléphone tenu en portrait la
// montre bien plus "zoomée"/cadrée serré malgré l'élargissement de FOV déjà appliqué (camera.ts).
// Fermable, reste fermé pour le reste de la session même si l'appareil repasse en portrait après
// un aller-retour par le paysage (pas de petit bandeau qui réapparaît sans arrêt à chaque rotation).
export function createOrientationNotice(): void {
  const mediaQuery = window.matchMedia("(orientation: portrait) and (pointer: coarse)");

  const root = document.createElement("div");
  root.className = "orientation-notice";
  root.setAttribute("role", "status");
  root.inert = true;

  const text = document.createElement("p");
  text.className = "orientation-notice__text";
  const renderText = () => {
    text.textContent = translate("orientation.notice");
  };
  renderText();
  onLanguageChange(renderText);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "orientation-notice__close";
  closeButton.textContent = "×";
  const renderCloseLabel = () => {
    closeButton.setAttribute("aria-label", translate("orientation.close"));
  };
  renderCloseLabel();
  onLanguageChange(renderCloseLabel);

  root.append(text, closeButton);
  document.body.appendChild(root);

  let dismissed = false;

  function update() {
    const visible = mediaQuery.matches && !dismissed;
    root.classList.toggle("orientation-notice--visible", visible);
    root.inert = !visible;
  }

  closeButton.addEventListener("click", () => {
    dismissed = true;
    update();
  });
  mediaQuery.addEventListener("change", update);

  update();
}
