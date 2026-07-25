// Détection tactile/pointeur imprécis ("coarse") plutôt qu'un sniff d'User-Agent — fiable pour
// distinguer téléphones/tablettes (mémoire GPU limitée) des ordinateurs, sans liste de chaînes
// UA à maintenir. Utilisé pour réduire le coût GPU (ombres, bloom, pixel ratio) sur ces
// appareils : un modèle de ~58 Mo + ombres + bloom peut dépasser leur budget mémoire et faire
// planter l'onglet ("Un problème est survenu de manière récurrente", message natif du
// navigateur, pas une erreur de l'app — voir CLAUDE.md racine).
export const isLowPowerDevice = window.matchMedia("(pointer: coarse)").matches;
