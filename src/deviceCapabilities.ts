// Détection tactile/pointeur imprécis ("coarse") plutôt qu'un sniff d'User-Agent — fiable pour
// distinguer téléphones/tablettes des ordinateurs, sans liste de chaînes UA à maintenir. Utilisé
// par main.ts pour bloquer entièrement l'expérience 3D sur ces appareils (voir ui/mobileBlocker.ts
// et CLAUDE.md racine, "Crash mobile") : un modèle de ~58 Mo + ombres + bloom a fait planter
// l'onglet ("Un problème est survenu de manière récurrente", message natif du navigateur, pas une
// erreur de l'app) même après réduction du pixel ratio/désactivation des ombres et du bloom — ces
// mitigations ont été retirées, retour à une page de blocage simple plutôt que de continuer à
// ajuster au cas par cas.
export const isLowPowerDevice = window.matchMedia("(pointer: coarse)").matches;
