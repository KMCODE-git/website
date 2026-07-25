export type LinkOverlayType = "side" | "page";

export interface LinkTemplate {
  type: LinkOverlayType;
  title: string;
  body: string;
}

// Contenu provisoire : les valeurs sont des clés façon i18next (ex. "contact.title"), pas du
// texte final à afficher — le vrai contenu/la vraie traduction sera branché plus tard. Servent
// pour l'instant de placeholder visible pour vérifier les gabarits (voir ui/linkOverlay.ts).
export const linkTemplates: Record<string, LinkTemplate> = {
  contact: {
    type: "side",
    title: "contact.title",
    body: "contact.description",
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
