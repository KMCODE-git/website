import fr from "./locales/fr.json";
import en from "./locales/en.json";

// Retour au principe d'une seule "langue active" à la fois (switcher, voir ui/languageToggle.ts)
// — le design bilingue "simultané" (les deux langues affichées ensemble) essayé d'abord pour la
// page Contact a été retiré sur demande explicite : "on fera un bouton pour changer de langue
// plus tard". Français par défaut (cohérent avec le domaine .fr).
export type Language = "fr" | "en";

const locales: Record<Language, Record<string, string>> = { fr, en };

let currentLanguage: Language = "fr";
const listeners: Array<(language: Language) => void> = [];

// Une clé sans traduction s'affiche telle quelle (jamais vide) — rend visible ce qui reste à
// traduire plutôt que de masquer le problème derrière un texte vide.
export function translate(key: string): string {
  return locales[currentLanguage][key] ?? key;
}

export function getLanguage(): Language {
  return currentLanguage;
}

// Notifie les éléments déjà construits (titre/sous-titre, formulaire de contact...) qu'ils
// doivent retraduire leur propre texte — pas de re-render global, chaque module s'abonne et met
// à jour ses propres nœuds via onLanguageChange() ci-dessous.
export function setLanguage(language: Language): void {
  if (language === currentLanguage) return;
  currentLanguage = language;
  for (const listener of listeners) listener(currentLanguage);
}

export function onLanguageChange(callback: (language: Language) => void): void {
  listeners.push(callback);
}
