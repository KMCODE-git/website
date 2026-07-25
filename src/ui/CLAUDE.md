# src/ui/

Overlay DOM par-dessus le canvas — tout ce qui n'est pas rendu en 3D. Le canvas seul n'est pas accessible (pas de focus, pas de lecteur d'écran), ces fichiers compensent ça.

Il n'y a plus de panneau de contenu **universel** ni de rond blanc de survol (voir `CLAUDE.md` racine, "Interaction et caméra") — le survol/clic d'un objet `animation=true` classique se voit directement sur l'objet 3D lui-même (`interactions/objectAnimations.ts`, `interactions/cameraRig.ts`), pas via un overlay DOM dédié. Pas de navigation entre scènes non plus (site à page unique, voir `CLAUDE.md` racine "Page unique" — l'ancienne `sceneNav.ts` a été retirée).

Nuance : `linkOverlay.ts` (voir plus bas) réintroduit un overlay de contenu, mais **scopé aux seuls objets portant la Custom Property `link`** — pas un panneau systématique sur chaque objet interactif comme l'ancien système retiré. Ne pas confondre les deux.

## `accessibleNav.ts`

Fallback clavier pour les objets interactifs : un bouton réel par entrée (visuellement caché via `.sr-nav__button`, visible seulement au `:focus`), appelant le même `onSelect(id)` que le raycaster — comportement identique par les deux chemins.

Le texte du bouton est l'`id` brut de l'objet (`entry.id`) — il n'y a pas de titre Blender à afficher (pas de panneau), et un bouton sans libellé serait inutilisable au clavier/lecteur d'écran.

**Stateful** : `createAccessibleNav()` retourne `{ setEntries(entries) }`, appelé une fois par `main.ts` (`init()`) pour générer les boutons à partir des `entries` résolues (`data/scenes.ts` + Blender).

## `loading.ts`

Overlay plein écran (spinner + texte), affiché pendant `init()` le temps que le `.glb` charge et parse — le modèle pèse plusieurs dizaines de Mo, ce n'est pas instantané. Fond en couleur unie, **la même que `scene.background`/`scene.fog`** (`#d9c7a3`, voir `scene.ts`) — délibéré : la scène 3D ne doit pas "trancher" sur une couleur de fond différente quand l'overlay se retire. Un essai précédent avec une image de fond (`public/img/landing_page.jpeg`, floutée) a été abandonné au profit de cette couleur unie + de l'animation d'arrivée décrite dans `interactions/CLAUDE.md` (`sceneEntrance.ts`). Spinner/texte en teinte sombre (`#2a2620`) plutôt que clair, pour rester lisibles sur ce fond clair (l'inverse d'avant, sur fond sombre).

## `linkOverlay.ts`

Overlay de contenu déclenché par la Custom Property Blender `link` (voir `CLAUDE.md` racine, "Interaction et caméra", et `data/links.ts` pour les templates). `createLinkOverlay(onCloseRequest)` retourne `{ open(template), close(), isOpen() }`, appelé depuis `main.ts` (`openLink()`) quand un objet `link` est cliqué — jamais depuis `raycaster.ts`/`objectAnimations.ts`, cohérent avec "qui décide" dans `interactions/CLAUDE.md`. `onCloseRequest` (= `closeActive`, voir plus bas) est fourni à la création — nécessaire parce que fermer un gabarit `"page"` doit aussi redézoomer la caméra, une responsabilité de `main.ts`, pas de ce module.

**Deux éléments `backdrop`/`panel` totalement distincts** (`createSubOverlay()`), un par gabarit (`LinkTemplate.type`, `data/links.ts`) — pas un seul élément partagé avec des classes basculées. `open(template)` choisit lequel des deux rendre visible selon `template.type`, l'autre reste cité mais caché/`inert`.

- **`"side"`** : `panel` occupe 1/3 de la largeur à droite, sur un `backdrop` flouté (`backdrop-filter`, `.link-overlay`) qui couvre le reste de l'écran. **Fermeture** : clic sur `backdrop` lui-même (pas dans `panel`, distingué via `event.target === backdrop`) ou touche Échap — ferme directement en local (`close()`), aucune caméra à réinitialiser. Pas de coordination d'état avec `activeId`/`isAnimating` (`main.ts`) : `backdrop` couvre tout l'écran avec `pointer-events: auto` quand visible, ce qui bloque naturellement `pointermove`/`pointerdown` sur le `<canvas>` en dessous (raycaster et parallaxe s'arrêtent donc de recevoir des events tout seuls, rien à désactiver explicitement).
- **`"page"`** : `panel` occupe 100% de la largeur — pas de "dehors" à cliquer sur son `backdrop` pour fermer (pas de listener de clic dessus), d'où un **bouton fermer** (`.link-overlay__close`, ×) posé une fois pour toutes dans son `panel` à la création. Son clic (et Échap) appelle `onCloseRequest()` — pas `close()` local — puisque `main.ts` (`openLink()`) a déjà zoomé la caméra dans l'objet avant d'appeler `open()` ; `closeActive()` (`main.ts`) doit donc systématiquement piloter la fermeture pour aussi redézoomer, `linkOverlay.close()` seul laisserait la caméra bloquée sur le zoom indéfiniment.
- **`inert`** appliqué sur le `backdrop` concerné quand fermé (pas seulement `aria-hidden`/opacité) — convention générale ci-dessous.
- Contenu actuellement **en placeholder façon clés i18next** (`template.title`/`template.body` affichés tels quels, ex. `"contact.title"`) — pas de vrai système de traduction branché, voir `data/links.ts`.

**Piège rencontré, résolu en séparant les éléments** : la première implémentation réutilisait un **seul** `panel` entre les deux gabarits (classes `--side`/`--page` togglées dans `open()`) — "side" anime `transform: translateX(...)`, "page" anime `transform: scale(...)`/`opacity`, deux transforms incompatibles sur le même élément. Ouvrir un gabarit juste après avoir fermé l'autre faisait démarrer la transition CSS depuis l'état "fermé" de l'**ancien** gabarit au lieu du nouveau — l'ouverture suivante jouait la mauvaise animation, même après avoir essayé un reset explicite (retrait de `--visible` + reflow forcé avant réajout) : le bug persistait. Deux éléments distincts, jamais retypés après création, éliminent la classe de bug entièrement — chacun n'a jamais qu'un seul état "fermé" possible, sa transition ne dépend jamais de ce qui était ouvert avant.

## Convention générale pour tout nouvel élément DOM ajouté ici

- Jamais de framework — DOM API directe (`document.createElement`, `innerHTML` pour du contenu statique).
- Tout élément interactif caché doit être neutralisé avec `inert`, pas seulement visuellement caché (piège déjà rencontré avec l'ancien panneau : un élément caché seulement via CSS `opacity`/`pointer-events` reste focusable au clavier).
- Les styles vont dans `src/style.css` (pas de CSS-in-JS ni de fichiers `.module.css` — un seul fichier global, cohérent avec le reste du projet).
