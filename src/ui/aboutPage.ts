import { translate, onLanguageChange } from "../i18n/translate";

// Date de naissance utilisée pour calculer l'âge affiché (computeAge()) — jamais une valeur figée
// en dur ("35 ans") à corriger à la main chaque année, demande explicite ("met en place un calcul
// dynamique pour que ça s'actualise seul"). Mois 0-indexé en JS : 6 = juillet.
const BIRTH_DATE = new Date(1991, 6, 1);

function computeAge(now: Date): number {
  let age = now.getFullYear() - BIRTH_DATE.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > BIRTH_DATE.getMonth() || (now.getMonth() === BIRTH_DATE.getMonth() && now.getDate() >= BIRTH_DATE.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// Contenu de la page "À propos" (link="about") — même style visuel que la page Contact (fond
// sombre texturé, titre + ligne d'astérisques, construits dans ui/linkOverlay.ts autour de cet
// élément, voir CLAUDE.md racine "Page À propos") : portrait + bio courte + compétences, texte
// final fourni directement par l'utilisateur et traduit en anglais (contrairement à la description
// placeholder de la page Projets, ceci n'est pas laissé en clé i18n non résolue).
export function createAboutPage(): HTMLElement {
  const root = document.createElement("div");
  root.className = "about-page";

  const photo = document.createElement("img");
  photo.className = "about-page__photo";
  photo.src = "/images/about/profil.jpg";
  photo.alt = "Kevin Morize";

  const identity = document.createElement("p");
  identity.className = "about-page__identity";
  // Recalculé à chaque rendu (construction + changement de langue) plutôt que mémorisé une fois —
  // coût négligeable, et couvre le cas (rare) où le site resterait ouvert à cheval sur un
  // anniversaire.
  const renderIdentity = () => {
    identity.textContent = `Kevin Morize — ${computeAge(new Date())} ${translate("about.age.suffix")}`;
  };
  renderIdentity();
  onLanguageChange(renderIdentity);

  const bio = document.createElement("p");
  bio.className = "about-page__text";
  const renderBio = () => {
    bio.textContent = translate("about.bio");
  };
  renderBio();
  onLanguageChange(renderBio);

  const skillsLabel = document.createElement("span");
  skillsLabel.className = "about-page__label";
  const renderSkillsLabel = () => {
    skillsLabel.textContent = translate("about.skills.label");
  };
  renderSkillsLabel();
  onLanguageChange(renderSkillsLabel);

  const skills = document.createElement("p");
  skills.className = "about-page__text";
  const renderSkills = () => {
    skills.textContent = translate("about.skills");
  };
  renderSkills();
  onLanguageChange(renderSkills);

  root.append(photo, identity, bio, skillsLabel, skills);
  return root;
}
