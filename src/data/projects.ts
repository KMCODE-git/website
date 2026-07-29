export interface ProjectEntry {
  id: string;
  title: string;
  // Clé i18n RÉSOLUE (contrairement à descriptionKey ci-dessous) — le poste est traduit dans
  // fr.json/en.json, demande explicite ("profite en pour traduire les postes").
  roleKey: string;
  image: string;
  // Clé i18n volontairement non résolue (façon i18next, même convention que l'ancien gabarit
  // générique title/body — voir CLAUDE.md racine) : affichée telle quelle par ui/projectsPage.ts
  // (jamais passée à translate()), pas de vrai laius décidé pour l'instant.
  descriptionKey: string;
  // Absent pour KMCODE/Element table/5 Dice Quest (pas de site public à lier) — ui/projectsPage.ts
  // n'affiche le lien "voir le site" que si ce champ est renseigné.
  url?: string;
}

// Ordre + titres + URLs fournis directement par l'utilisateur (texte final, jamais traduit,
// contrairement à roleKey/descriptionKey ci-dessus) — pas un ordre alphabétique/chronologique
// déductible du code. Element table/5 Dice Quest insérés après All.com sur demande explicite.
export const projects: ProjectEntry[] = [
  {
    id: "kmcode",
    title: "KMCODE",
    roleKey: "projects.kmcode.role",
    image: "/images/projects/portfolio_2.jpg",
    descriptionKey: "projects.kmcode.description",
  },
  {
    id: "allcom",
    title: "All.com",
    roleKey: "projects.allcom.role",
    image: "/images/projects/accor.jpg",
    descriptionKey: "projects.allcom.description",
    url: "https://all.accor.com/a/fr.html",
  },
  {
    id: "elementtable",
    title: "Element table",
    roleKey: "projects.elementtable.role",
    image: "/images/projects/element_table.jpg",
    descriptionKey: "projects.elementtable.description",
  },
  {
    id: "5dice",
    title: "5 dice quest",
    roleKey: "projects.5dice.role",
    image: "/images/projects/5_dice.jpg",
    descriptionKey: "projects.5dice.description",
  },
  {
    id: "kricar",
    title: "Kricar",
    roleKey: "projects.kricar.role",
    image: "/images/projects/kricar.jpg",
    descriptionKey: "projects.kricar.description",
    url: "https://kricar.fr",
  },
  {
    id: "tracepro",
    title: "Trace pro",
    roleKey: "projects.tracepro.role",
    image: "/images/projects/trace.jpg",
    descriptionKey: "projects.tracepro.description",
    url: "https://trace.plus/fr/app",
  },
  {
    id: "portfolio",
    title: "Portfolio",
    roleKey: "projects.portfolio.role",
    image: "/images/projects/portfolio_1.jpg",
    descriptionKey: "projects.portfolio.description",
    url: "https://kevinmorize.netlify.app",
  },
];
