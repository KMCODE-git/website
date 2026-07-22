export interface CameraFocus {
  position: [number, number, number];
  target: [number, number, number];
}

// Forme résolue (ce que produit objects/resolveEntries.ts, consommé par ui/panel.ts et
// ui/accessibleNav.ts) — title/description viennent toujours de Blender (userData, passées
// par i18n/translate.ts), jamais de data/scenes.ts ni d'un repli sur `id`. `title` peut être
// vide si l'objet n'a pas de Custom Property "title" — voir ui/panel.ts pour ce que ça implique.
export interface PortfolioEntry {
  id: string;
  title: string;
  description: string;
  links: { label: string; href: string }[];
  focus: CameraFocus;
}

// Ce qu'on écrit à la main dans data/scenes.ts — uniquement pour surcharger le focus
// auto-calculé, ou ajouter des `links` (pas d'équivalent Blender pour une liste). Le contenu
// textuel (title/description) vient exclusivement de Blender, voir objects/resolveEntries.ts.
export interface PortfolioEntryOverride {
  links?: { label: string; href: string }[];
  focus?: CameraFocus;
}

export interface DistanceRange {
  min: number;
  max: number;
}

export interface PanBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface AngleRange {
  min: number;
  max: number;
}

export interface SceneMeta {
  id: string;
  label: string;
  defaultCamera: CameraFocus;
  distance?: DistanceRange;
  panBounds?: PanBounds;
  polarAngle?: AngleRange;
  azimuthAngle?: AngleRange;
  entries?: Record<string, PortfolioEntryOverride>;
}

export const scenes: SceneMeta[] = [
  {
    id: "office",
    label: "Office",
    defaultCamera: {
      // Vue de 3/4, à 45° vers la droite plutôt que de face (même distance à la cible).
      position: [2.5, 2, 2.5],
      target: [0, 0.9, 0],
    },
    // Zoom de base = zoom max (on ne peut pas dézoomer plus loin que la vue d'arrivée),
    // et pan resserré pour ne pas pouvoir sortir de la pièce (y compris via Cmd/Ctrl+glisser).
    distance: { min: 1, max: 3.7 },
    panBounds: { minX: -2, maxX: 2, minY: 0.3, maxY: 2.5, minZ: -1, maxZ: 2 },
    entries: {
      // "projects"/"contact" ci-dessous doivent correspondre à la Custom Property "id" posée
      // sur l'objet dans Blender (voir objects/CLAUDE.md). title/description viennent de
      // Blender — seul le focus est surchargé ici (calibré par capture d'écran, plus précis
      // que l'auto). Un nouvel objet n'a besoin d'aucune entrée pour fonctionner.
      projects: {
        focus: {
          position: [0.32, 0.85, 0.31],
          target: [-0.11, 0.85, -0.12],
        },
      },
      contact: {
        focus: {
          position: [0.23, 0.62, -0.17],
          target: [0.15, 0.52, -0.27],
        },
      },
      // computeAutoFocus() prend la plus grande dimension de la bounding box quel que soit
      // l'axe (voir objects/autoFocus.ts) : correct pour un objet ~cubique, faux ici. Tryptich
      // est large (2.29m) mais peu haut (0.92m) — l'auto le traitait comme "haut" et reculait
      // trop loin. AppleWatch est minuscule (~4cm, id posé sur la vitre seule) — la distance
      // auto-calculée tombait sous camera.near (0.1, voir camera.ts), la caméra traversait
      // l'objet. Focus calibré à la main dans les deux cas.
      tryptich: {
        focus: {
          position: [-0.06, 1.8, 0.84],
          target: [-1.98, 1.66, -0.4],
        },
      },
      apple_watch: {
        focus: {
          position: [-0.157, 0.587, 0.311],
          target: [-0.26, 0.53, 0.23],
        },
      },
    },
  },
];
