import { projects } from "../data/projects";
import { translate, onLanguageChange } from "../i18n/translate";

export interface ProjectsPage {
  element: HTMLElement;
  // Remet le carrousel sur le premier projet — appelé à chaque ouverture du gabarit "page"
  // (ui/linkOverlay.ts) pour ne jamais rouvrir sur le dernier projet consulté la fois précédente.
  reset: () => void;
}

// Doit rester synchronisé avec les mêmes constantes en dur dans style.css
// (.projects-page__image-slide { flex: 0 0 <SLIDE_HEIGHT_PERCENT>% }, gap:
// <GAP_PERCENT>%) — CSS pur ne peut pas lire ces valeurs TypeScript, comme pour
// GRADIENT_TOP/GRADIENT_BOTTOM (scene.ts/style.css). Le calcul lui-même (voir
// translateYPercent()) est en pourcentages relatifs à la hauteur du viewport, donc valable quelle
// que soit sa taille réelle en pixels. Valeurs relevées (80/4 à l'origine) pour laisser dépasser
// nettement plus des vignettes voisines (~20% de peek chacune plutôt que ~6%) — demande explicite,
// calibré sur une seconde maquette de référence (helpers/, non versionnée).
const SLIDE_HEIGHT_PERCENT = 54;
const GAP_PERCENT = 3;

// Décalage vertical du rail pour centrer `index` dans le viewport, en laissant dépasser le bas de
// la vignette précédente et le haut de la suivante ("on voit l'image avant et après", demande
// explicite) : chaque diapositive occupe SLIDE_HEIGHT_PERCENT% de la hauteur du viewport, espacées
// de GAP_PERCENT% (pitch = somme des deux) ; on centre la diapositive `index` (son centre est à
// index*pitch + SLIDE_HEIGHT_PERCENT/2 dans le rail) sur le centre du viewport (50%).
function translateYPercent(index: number): number {
  const pitch = SLIDE_HEIGHT_PERCENT + GAP_PERCENT;
  return 50 - SLIDE_HEIGHT_PERCENT / 2 - pitch * index;
}

// Carrousel un-projet-à-la-fois (fiche à gauche, carrousel d'images vertical à droite) — reproduit
// la mise en page de la maquette fournie (helpers/, image plein cadre) tout en laissant deviner la
// vignette précédente/suivante (demande explicite : "carrousel vertical où on voit l'image avant
// et après"). Titre = texte final fourni directement par l'utilisateur, jamais passé à
// translate() ; le poste (`roleKey`), lui, EST traduit (`translate()`, demande explicite ultérieure
// "profite en pour traduire les postes") ; la description reste une clé i18n non résolue
// (data/projects.ts), affichée telle quelle pour une raison différente (laius pas encore écrit).
export function createProjectsPage(): ProjectsPage {
  let index = 0;

  const root = document.createElement("div");
  root.className = "projects-page";

  const content = document.createElement("div");
  content.className = "projects-page__content";

  const eyebrow = document.createElement("p");
  eyebrow.className = "projects-page__eyebrow";
  const renderEyebrow = () => {
    eyebrow.textContent = translate("projects.eyebrow");
  };
  renderEyebrow();
  onLanguageChange(renderEyebrow);

  const title = document.createElement("h2");
  title.className = "projects-page__title";

  const roleLabel = document.createElement("span");
  roleLabel.className = "projects-page__label";
  const renderRoleLabel = () => {
    roleLabel.textContent = translate("projects.role.label");
  };
  renderRoleLabel();
  onLanguageChange(renderRoleLabel);
  const roleValue = document.createElement("p");
  roleValue.className = "projects-page__value";
  const roleField = document.createElement("div");
  roleField.className = "projects-page__field";
  roleField.append(roleLabel, roleValue);

  const descriptionLabel = document.createElement("span");
  descriptionLabel.className = "projects-page__label";
  const renderDescriptionLabel = () => {
    descriptionLabel.textContent = translate("projects.description.label");
  };
  renderDescriptionLabel();
  onLanguageChange(renderDescriptionLabel);
  const descriptionValue = document.createElement("p");
  descriptionValue.className = "projects-page__description";
  const descriptionField = document.createElement("div");
  descriptionField.className = "projects-page__field";
  descriptionField.append(descriptionLabel, descriptionValue);

  // Absent côté data/projects.ts pour KMCODE (pas de site public) — masqué plutôt que rendu avec
  // un href vide, voir render().
  const visitLink = document.createElement("a");
  visitLink.className = "projects-page__link";
  visitLink.target = "_blank";
  visitLink.rel = "noopener noreferrer";
  const visitLabel = document.createElement("span");
  const renderVisitLabel = () => {
    visitLabel.textContent = translate("projects.visit");
  };
  renderVisitLabel();
  onLanguageChange(renderVisitLabel);
  const visitArrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  visitArrow.setAttribute("viewBox", "0 0 24 24");
  visitArrow.setAttribute("class", "projects-page__link-arrow");
  visitArrow.setAttribute("aria-hidden", "true");
  const visitArrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  visitArrowPath.setAttribute("d", "M5 12h14m0 0-6-6m6 6-6 6");
  visitArrowPath.setAttribute("stroke", "currentColor");
  visitArrowPath.setAttribute("stroke-width", "2");
  visitArrowPath.setAttribute("fill", "none");
  visitArrowPath.setAttribute("stroke-linecap", "round");
  visitArrowPath.setAttribute("stroke-linejoin", "round");
  visitArrow.append(visitArrowPath);
  visitLink.append(visitLabel, visitArrow);

  const nav = document.createElement("div");
  nav.className = "projects-page__nav";
  const prevButton = document.createElement("button");
  prevButton.type = "button";
  prevButton.className = "projects-page__nav-button";
  prevButton.textContent = "‹";
  const counter = document.createElement("span");
  counter.className = "projects-page__counter";
  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "projects-page__nav-button";
  nextButton.textContent = "›";
  const renderNavLabels = () => {
    prevButton.setAttribute("aria-label", translate("projects.nav.prev"));
    nextButton.setAttribute("aria-label", translate("projects.nav.next"));
  };
  renderNavLabels();
  onLanguageChange(renderNavLabels);
  nav.append(prevButton, counter, nextButton);

  content.append(eyebrow, title, roleField, descriptionField, visitLink, nav);

  // Toutes les diapositives existent en même temps dans le rail (pas un <img> unique dont on
  // change le src) — nécessaire pour un vrai glissement vertical entre images différentes, et
  // permet de deviner la vignette précédente/suivante pendant la transition, pas seulement à l'arrêt.
  const imageViewport = document.createElement("div");
  imageViewport.className = "projects-page__image";
  const imageTrack = document.createElement("div");
  imageTrack.className = "projects-page__image-track";
  const slides = projects.map((project) => {
    const slide = document.createElement("div");
    slide.className = "projects-page__image-slide";
    const img = document.createElement("img");
    // object-fit: contain (style.css) — jamais crop, quitte à ne pas remplir toute la hauteur de
    // la diapositive (demande explicite).
    img.src = project.image;
    img.alt = project.title;
    slide.append(img);
    return slide;
  });
  imageTrack.append(...slides);
  imageViewport.append(imageTrack);

  root.append(content, imageViewport);

  function render(): void {
    const project = projects[index];
    title.textContent = project.title;
    roleValue.textContent = translate(project.roleKey);
    descriptionValue.textContent = project.descriptionKey;
    counter.textContent = `${index + 1} / ${projects.length}`;
    if (project.url) {
      visitLink.href = project.url;
      visitLink.style.display = "";
    } else {
      visitLink.removeAttribute("href");
      visitLink.style.display = "none";
    }
    imageTrack.style.transform = `translateY(${translateYPercent(index)}%)`;
  }

  prevButton.addEventListener("click", () => {
    index = (index - 1 + projects.length) % projects.length;
    render();
  });
  nextButton.addEventListener("click", () => {
    index = (index + 1) % projects.length;
    render();
  });
  // roleValue dépend désormais de la langue active (translate(project.roleKey)) — contrairement
  // aux autres champs de render(), qui n'ont pas besoin de se retraduire (titre/description ne
  // sont jamais traduits). Réappelle tout render() par simplicité plutôt que d'isoler juste
  // roleValue — le reste des affectations est idempotent (même valeur réécrite), coût négligeable.
  onLanguageChange(render);

  render();

  return {
    element: root,
    reset() {
      index = 0;
      // Saute directement à la première diapositive plutôt que de glisser depuis la dernière
      // position consultée (la transition CSS de .projects-page__image-track s'appliquerait sinon
      // même ici) — désactivée le temps de ce seul appel, puis restaurée après un reflow forcé
      // pour que les clics prev/next suivants glissent normalement.
      imageTrack.style.transition = "none";
      render();
      void imageTrack.offsetHeight;
      imageTrack.style.transition = "";
    },
  };
}
