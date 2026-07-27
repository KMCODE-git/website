// "form" (contact) est géré à part de "side"/"page" au niveau de la GÉOMÉTRIE/fermeture de
// l'overlay (voir ui/linkOverlay.ts, ui/CLAUDE.md) : même comportement de fermeture que "side"
// (clic sur le fond flouté ou Échap, pas de caméra impliquée) mais un contenu entièrement dédié
// (formulaire) plutôt que le gabarit générique title/body ci-dessous — jamais partagé avec le
// panel "side" utilisé par hobbies, pour éviter de reproduire le bug déjà rencontré (deux gabarits
// à la structure DOM différente réutilisant le même panel, voir ui/CLAUDE.md).
export type LinkOverlayType = "side" | "page" | "form";

export interface LinkTemplate {
  type: LinkOverlayType;
  // Non utilisés pour type="form" (contenu dédié construit dans ui/linkOverlay.ts) — toujours
  // renseignés pour "side"/"page" classiques. Valeurs = clés i18n (i18n/translate.ts), pas du
  // texte final.
  title?: string;
  body?: string;
}

// Contenu de "hobbies"/"projects" toujours en placeholder façon clés i18next (pas de vraie
// traduction branchée pour ces deux-là) — seul "contact" a son vrai contenu pour l'instant (voir
// CLAUDE.md racine, "Prochaines étapes possibles").
export const linkTemplates: Record<string, LinkTemplate> = {
  contact: {
    type: "form",
  },
  hobbies: {
    type: "side",
    title: "hobbies.title",
    body: "hobbies.description",
  },
  projects: {
    type: "page",
    title: "projects.title",
    body: "projects.description",
  },
};
