import { getLanguage, setLanguage, onLanguageChange, type Language } from "../i18n/translate";

// Bouton fixe (coin haut-gauche, juste à droite de .sound-toggle, même style verre) pour
// basculer la langue affichée par tout ce qui utilise i18n/translate.ts (titre/sous-titre,
// formulaire de contact). Affiche la langue ACTUELLE (ex. "FR" tant que le site est en français) —
// inversé sur demande explicite depuis un premier essai qui affichait la langue cible ("EN" en
// étant en français), jugé confus.
export function createLanguageToggle(): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "language-toggle";

  function render(language: Language) {
    button.textContent = language.toUpperCase();
    // aria-label décrit l'action (langue obtenue en cliquant), pas l'état affiché — reste correct
    // même si le texte visible montre désormais la langue actuelle plutôt que la cible.
    const target: Language = language === "fr" ? "en" : "fr";
    button.setAttribute("aria-label", target === "en" ? "Switch to English" : "Passer en français");
  }
  render(getLanguage());
  onLanguageChange(render);

  button.addEventListener("click", () => {
    setLanguage(getLanguage() === "fr" ? "en" : "fr");
  });

  document.body.appendChild(button);
}
