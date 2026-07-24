# src/ui/

Overlay DOM par-dessus le canvas — tout ce qui n'est pas rendu en 3D. Le canvas seul n'est pas accessible (pas de focus, pas de lecteur d'écran), ces fichiers compensent ça.

Il n'y a plus de panneau de contenu ni de rond blanc de survol (voir `CLAUDE.md` racine, "Interaction et caméra") — le survol/clic se voit directement sur l'objet 3D lui-même (`interactions/objectAnimations.ts`, `interactions/cameraRig.ts`), pas via un overlay DOM dédié. Pas de navigation non plus (site à page unique, voir `CLAUDE.md` racine "Page unique" — l'ancienne `sceneNav.ts` a été retirée).

## `accessibleNav.ts`

Fallback clavier pour les objets interactifs : un bouton réel par entrée (visuellement caché via `.sr-nav__button`, visible seulement au `:focus`), appelant le même `onSelect(id)` que le raycaster — comportement identique par les deux chemins.

Le texte du bouton est l'`id` brut de l'objet (`entry.id`) — il n'y a pas de titre Blender à afficher (pas de panneau), et un bouton sans libellé serait inutilisable au clavier/lecteur d'écran.

**Stateful** : `createAccessibleNav()` retourne `{ setEntries(entries) }`, appelé une fois par `main.ts` (`init()`) pour générer les boutons à partir des `entries` résolues (`data/scenes.ts` + Blender).

## `loading.ts`

Overlay plein écran (spinner + texte), affiché pendant `init()` le temps que le `.glb` charge et parse — le modèle pèse plusieurs dizaines de Mo, ce n'est pas instantané.

## Convention générale pour tout nouvel élément DOM ajouté ici

- Jamais de framework — DOM API directe (`document.createElement`, `innerHTML` pour du contenu statique).
- Tout élément interactif caché doit être neutralisé avec `inert`, pas seulement visuellement caché (piège déjà rencontré avec l'ancien panneau : un élément caché seulement via CSS `opacity`/`pointer-events` reste focusable au clavier).
- Les styles vont dans `src/style.css` (pas de CSS-in-JS ni de fichiers `.module.css` — un seul fichier global, cohérent avec le reste du projet).
