import fr from "./locales/fr.json";

// Les Custom Properties Blender "title"/"description" contiennent des clés de traduction
// (ex. "title.projects"), pas du texte final — préparation pour une gestion de langue future.
// Le français (i18n/locales/fr.json) est la seule langue branchée pour l'instant ; en.json
// existe déjà à côté mais n'est pas encore importé ici — passer à un vrai choix de langue
// reviendra à sélectionner le bon fichier selon la langue courante, pas à changer translate().
// Tant qu'une clé n'a pas de traduction dans le fichier actif, elle s'affiche telle quelle :
// ça rend visible ce qui reste à traduire, plutôt que de masquer le problème derrière un texte vide.
const translations: Record<string, string> = fr;

export function translate(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return translations[key] ?? key;
}
