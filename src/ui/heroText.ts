import { translate, onLanguageChange } from "../i18n/translate";

// Titre/sous-titre fixes en haut de l'écran — inspiré d'une maquette fournie par l'utilisateur
// (capture dans helpers/, non versionné, voir .gitignore). Une seule langue affichée à la fois
// (voir ui/languageToggle.ts) — chaque nœud se retraduit lui-même via onLanguageChange() plutôt
// que de reconstruire le DOM à chaque bascule.
//
// Purement décoratif : `pointer-events: none` sur le conteneur (voir style.css) pour ne jamais
// intercepter de clic destiné aux objets 3D en-dessous, même si le texte chevauche visuellement
// le haut de la scène selon la résolution. Créé une seule fois au démarrage, jamais
// ouvert/fermé — contrairement à linkOverlay.ts, ce n'est pas un gabarit de contenu déclenché.
export function createHeroText(): void {
  const container = document.createElement("div");
  container.className = "hero-text";

  const title = document.createElement("h1");
  title.className = "hero-text__title";

  const subtitle = document.createElement("p");
  subtitle.className = "hero-text__subtitle";

  function render() {
    title.textContent = translate("hero.title");
    subtitle.textContent = translate("hero.subtitle");
  }
  render();
  onLanguageChange(render);

  container.append(title, subtitle);
  document.body.appendChild(container);
}
