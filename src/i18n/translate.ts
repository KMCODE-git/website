import fr from "./locales/fr.json";
import en from "./locales/en.json";

// Design bilingue "simultané" (voir CLAUDE.md racine, page "Contact") : les deux langues
// s'affichent ensemble sur un même libellé (français en principal, anglais en sous-titre) plutôt
// qu'un switcher qui bascule de l'une à l'autre — translate() renvoie donc toujours les DEUX
// valeurs pour une même clé, jamais une seule "langue active" comme l'ancien système i18n retiré
// avec le panneau de contenu (voir git log, i18n/translate.ts d'alors).
export interface Translation {
  primary: string;
  secondary: string;
}

const primaryLocale: Record<string, string> = fr;
const secondaryLocale: Record<string, string> = en;

// Une clé sans traduction s'affiche telle quelle (jamais vide) — rend visible ce qui reste à
// traduire plutôt que de masquer le problème derrière un texte vide.
export function translate(key: string): Translation {
  return {
    primary: primaryLocale[key] ?? key,
    secondary: secondaryLocale[key] ?? key,
  };
}
