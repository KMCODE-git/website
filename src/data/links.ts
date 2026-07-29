// "form" (contact) et "about" sont gérés à part de "side"/"page" au niveau de la GÉOMÉTRIE/
// fermeture de l'overlay (voir ui/linkOverlay.ts, ui/CLAUDE.md) : même comportement de fermeture
// que "side" (clic sur le fond flouté ou Échap, pas de caméra impliquée) et même géométrie (bandeau
// 1/3 écran), mais un contenu entièrement dédié (pas le gabarit générique title/body ci-dessous) —
// jamais partagés entre eux ni avec "side", pour éviter de reproduire le bug déjà rencontré (deux
// gabarits à la structure DOM différente réutilisant le même panel, voir ui/CLAUDE.md).
export type LinkOverlayType = "side" | "page" | "form" | "about";

export interface LinkTemplate {
  type: LinkOverlayType;
  // Non utilisés pour type="form" (contact, contenu dédié dans ui/contactForm.ts), type="about"
  // (contenu dédié dans ui/aboutPage.ts) ni type="page" (projects, contenu dédié dans
  // ui/projectsPage.ts) — seulement renseignés pour "side" classique. Valeurs = clés i18n
  // (i18n/translate.ts), pas du texte final.
  title?: string;
  body?: string;
}

// "contact"/"about"/"projects" ont chacun leur vrai contenu dédié (voir contactForm.ts/
// aboutPage.ts/projectsPage.ts, data/projects.ts pour ce dernier) — plus aucune entrée sur le
// gabarit générique title/body ("side") pour l'instant, tous les liens actuels ont du texte final.
export const linkTemplates: Record<string, LinkTemplate> = {
  contact: {
    type: "form",
  },
  about: {
    type: "about",
  },
  projects: {
    type: "page",
  },
};
