# src/ui/

Overlay DOM par-dessus le canvas — tout ce qui n'est pas rendu en 3D. Le canvas seul n'est pas accessible (pas de focus, pas de lecteur d'écran), ces fichiers compensent ça.

Il n'y a plus de panneau de contenu **universel** ni de rond blanc de survol (voir `CLAUDE.md` racine, "Interaction et caméra") — le survol/clic d'un objet `animation=true` classique se voit directement sur l'objet 3D lui-même (`interactions/objectAnimations.ts`, `interactions/cameraRig.ts`), pas via un overlay DOM dédié. Pas de navigation entre scènes non plus (site à page unique, voir `CLAUDE.md` racine "Page unique" — l'ancienne `sceneNav.ts` a été retirée).

Nuance : `linkOverlay.ts` (voir plus bas) réintroduit un overlay de contenu, mais **scopé aux seuls objets portant la Custom Property `link`** — pas un panneau systématique sur chaque objet interactif comme l'ancien système retiré. Ne pas confondre les deux.

Autre nuance, avec `siteMenu.ts` (voir plus bas) : ce n'est **pas** un retour de l'ancienne `sceneNav.ts` (barre flottante de navigation entre scènes, retirée avec l'architecture multi-scènes — voir `CLAUDE.md` racine "Page unique"). `siteMenu.ts` ne change jamais de scène (il n'y en a qu'une) — il ouvre les mêmes gabarits de contenu que les objets `link` de la scène 3D (`data/links.ts`), juste depuis un point d'entrée fixe plutôt qu'en cherchant/cliquant l'objet correspondant.

## `accessibleNav.ts`

Fallback clavier pour les objets interactifs : un bouton réel par entrée (visuellement caché via `.sr-nav__button`, visible seulement au `:focus`), appelant le même `onSelect(id)` que le raycaster — comportement identique par les deux chemins.

Le texte du bouton est l'`id` brut de l'objet (`entry.id`) — il n'y a pas de titre Blender à afficher (pas de panneau), et un bouton sans libellé serait inutilisable au clavier/lecteur d'écran.

**Stateful** : `createAccessibleNav()` retourne `{ setEntries(entries) }`, appelé une fois par `main.ts` (`init()`) pour générer les boutons à partir des `entries` résolues (`data/scenes.ts` + Blender).

## `loading.ts`

Overlay plein écran (spinner + texte), affiché pendant `init()` le temps que le `.glb` charge et parse — le modèle pèse plusieurs dizaines de Mo, ce n'est pas instantané. Fond en couleur unie, **la même que `scene.background`/`scene.fog`** (`#d9c7a3`, voir `scene.ts`) — délibéré : la scène 3D ne doit pas "trancher" sur une couleur de fond différente quand l'overlay se retire. Un essai précédent avec une image de fond (`public/img/landing_page.jpeg`, floutée) a été abandonné au profit de cette couleur unie + de l'animation d'arrivée décrite dans `interactions/CLAUDE.md` (`sceneEntrance.ts`). Spinner/texte en teinte sombre (`#2a2620`) plutôt que clair, pour rester lisibles sur ce fond clair (l'inverse d'avant, sur fond sombre).

## `linkOverlay.ts`

Overlay de contenu déclenché par la Custom Property Blender `link` (voir `CLAUDE.md` racine, "Interaction et caméra", et `data/links.ts` pour les templates). `createLinkOverlay(onCloseRequest)` retourne `{ open(template), close(), isOpen() }`, appelé depuis `main.ts` (`openLink()`) quand un objet `link` est cliqué — jamais depuis `raycaster.ts`/`objectAnimations.ts`, cohérent avec "qui décide" dans `interactions/CLAUDE.md`. `onCloseRequest` (= `closeActive`, voir plus bas) est fourni à la création — nécessaire parce que fermer un gabarit `"page"` doit aussi redézoomer la caméra, une responsabilité de `main.ts`, pas de ce module.

**Trois éléments `backdrop`/`panel` totalement distincts** (`createBaseOverlay()`), un par gabarit (`LinkTemplate.type`, `data/links.ts`) — pas un seul élément partagé avec des classes basculées. `open(template)` choisit lequel des trois rendre visible selon `template.type`, les autres restent créés mais cachés/`inert`.

- **`"side"`** : `panel` occupe 1/3 de la largeur à droite, sur un `backdrop` flouté (`backdrop-filter`, `.link-overlay`) qui couvre le reste de l'écran. Contenu générique title/body (`template.title`/`template.body`, clés i18next non résolues pour l'instant — voir `data/links.ts`). **Fermeture** : clic sur `backdrop` lui-même (pas dans `panel`, distingué via `event.target === backdrop`) ou touche Échap — ferme directement en local (`close()`), aucune caméra à réinitialiser. Pas de coordination d'état avec `activeId`/`isAnimating` (`main.ts`) : `backdrop` couvre tout l'écran avec `pointer-events: auto` quand visible, ce qui bloque naturellement `pointermove`/`pointerdown` sur le `<canvas>` en dessous (raycaster et parallaxe s'arrêtent donc de recevoir des events tout seuls, rien à désactiver explicitement).
- **`"form"`** (contact) : même géométrie/fermeture que `"side"` (1/3 largeur, clic sur `backdrop`/Échap, pas de caméra) — la seule différence est le **contenu** : un formulaire dédié (`contactForm.ts`, `createContactForm()`) plutôt que title/body générique, construit une seule fois à la création de l'overlay (pas à chaque `open()`). Titre + ligne d'astérisques (`.contact-form__title`/`.contact-form__divider`) ajoutés directement dans `linkOverlay.ts` autour du formulaire — voir `contactForm.ts` pour les champs/labels/soumission.
- **`"page"`** : `panel` occupe 100% de la largeur — pas de "dehors" à cliquer sur son `backdrop` pour fermer (pas de listener de clic dessus), d'où un **bouton fermer** (`.link-overlay__close`, ×) posé une fois pour toutes dans son `panel` à la création. Son clic (et Échap) appelle `onCloseRequest()` — pas `close()` local — puisque `main.ts` (`openLink()`) a déjà zoomé la caméra dans l'objet avant d'appeler `open()` ; `closeActive()` (`main.ts`) doit donc systématiquement piloter la fermeture pour aussi redézoomer, `linkOverlay.close()` seul laisserait la caméra bloquée sur le zoom indéfiniment.
- **`inert`** appliqué sur le `backdrop` concerné quand fermé (pas seulement `aria-hidden`/opacité) — convention générale ci-dessous.
- Contenu **en placeholder façon clés i18next** pour `"hobbies"`/`"projects"` (`template.title`/`template.body` affichés tels quels, ex. `"hobbies.title"`) — `"contact"` (`"form"`) a son vrai contenu, voir `contactForm.ts` et CLAUDE.md racine "Page Contact".

**Piège rencontré, résolu en séparant les éléments** : la première implémentation réutilisait un **seul** `panel` entre les deux gabarits d'alors (classes `--side`/`--page` togglées dans `open()`) — "side" anime `transform: translateX(...)`, "page" anime `transform: scale(...)`/`opacity`, deux transforms incompatibles sur le même élément. Ouvrir un gabarit juste après avoir fermé l'autre faisait démarrer la transition CSS depuis l'état "fermé" de l'**ancien** gabarit au lieu du nouveau — l'ouverture suivante jouait la mauvaise animation, même après avoir essayé un reset explicite (retrait de `--visible` + reflow forcé avant réajout) : le bug persistait. Éléments distincts, jamais retypés après création, éliminent la classe de bug entièrement — chacun n'a jamais qu'un seul état "fermé" possible, sa transition ne dépend jamais de ce qui était ouvert avant. Règle appliquée dès la conception de `"form"` (jamais partagé avec `"side"`, malgré une géométrie identique) plutôt que redécouverte à l'usage.

## `contactForm.ts`

Construit le `<form>` de la page Contact (`createContactForm()`, DOM API directe comme le reste de `ui/`) — utilisé une seule fois par `linkOverlay.ts` à la création de son sous-overlay `"form"`, pas reconstruit à chaque ouverture.

- **Libellé bilingue simultané** (`createLabel(key)`) : `i18n/translate.ts` renvoie `{ primary, secondary }` pour une clé — rendu comme deux `<span>` (`.contact-form__label-primary` en gras/majuscules, `.contact-form__label-secondary` en sous-titre muet), jamais un switcher qui bascule entre les deux. Inspiré d'une maquette fournie par l'utilisateur (captures dans `helpers/`, non versionné — voir `.gitignore`).
- **Champs** (`FIELDS`) : Nom/Société, Email, Téléphone en `<input>`, Demande en `<textarea>` — Email et Demande `required` (le minimum pour pouvoir répondre), Nom/Téléphone optionnels. Validation native du navigateur (`required`, `type="email"`), pas de validation JS custom.
- **Soumission** : `submit` → `event.preventDefault()` → construit une URL `mailto:contact@kmcode.fr?subject=...&body=...` (nom/email/téléphone/demande concaténés dans le corps) → `window.location.href = url`, ouvre le client mail par défaut de l'utilisateur. Pas d'envoi réseau, pas de backend/service tiers — décision explicite ("mailto c'est ok"), garde le site 100% statique.

## `siteMenu.ts`

Menu fixe (coin haut-droite, `position: fixed`, `.site-menu`) : un bouton rond ("···", devient "×" une fois ouvert) qui déploie un petit panneau listant les mêmes pages que les objets `link` de la scène (`data/links.ts`) — accès direct sans devoir chercher/cliquer l'objet 3D correspondant. `createSiteMenu(entries, onSelect)` prend une liste `{ id, label }[]` (labels choisis côté code, pas de vrai contenu i18n branché — voir `data/links.ts`) et appelle `onSelect(id)` au clic sur une entrée ; `main.ts` câble ça vers `activateLink(id, null)` (`selectMenuEntry()`), la même fonction que celle utilisée en interne par `openLink()` quand on clique directement un objet `link` en 3D — un seul chemin pour ouvrir un gabarit, deux points d'entrée.

- **`position: fixed` suffit à l'isoler de la parallaxe** (`interactions/parallax.ts`) : la parallaxe ne bouge que `camera.position`/`camera.lookAt`, jamais le DOM — n'importe quel élément DOM en `fixed`/`absolute` est déjà insensible à cet effet sans rien coder de spécial.
- **`z-index: 25`** (`.site-menu`, `style.css`) — volontairement **sous** `.loading` (30, reste masqué derrière l'écran de chargement tant que le modèle n'a pas fini de charger) et **sous** `.link-overlay` (40, un gabarit "side"/"page" déjà ouvert reprend la priorité visuelle/de clic). Conséquence pour les utilisateurs souris : le bouton du menu devient visuellement inatteignable pendant qu'un gabarit est affiché — cohérent avec le reste de l'app (une seule chose "active" à la fois, jamais deux surfaces cliquables superposées), pas une limitation accidentelle.
- **Fermeture** : re-clic sur le bouton, clic n'importe où en dehors du menu (`pointerdown` sur `document`, même logique que le backdrop de `link-overlay.ts` "side"), sélection d'une entrée, ou Échap (`main.ts`, même handler global que `closeActive()`/`linkOverlay.close()`).
- **`activateLink(id, sourceObject)`** (`main.ts`) est la factorisation qui rend ça possible : la logique de `openLink()` (utilisée depuis un clic 3D) a été extraite pour accepter soit l'objet cliqué directement (cas normal), soit `null` (cas menu fixe) — dans ce second cas, l'objet nécessaire au zoom d'un gabarit `"page"` (`computeAutoFocus()`) est retrouvé via `linkObjectsById` (`Map<linkId, Object3D>`, reconstruite dans `init()` à partir de `interactiveObjects`, la même liste que `currentObjectsById`). Les gabarits `"side"` n'ont pas besoin de cet objet — ils fonctionnent identiquement par les deux chemins.
- **Gardes dans `selectMenuEntry()`** identiques à celles du raycaster (`sceneEntranceActive`/`isAnimating`/`activeId`) + `linkOverlay.isOpen()` en plus — nécessaire ici parce que `.site-menu` (z-index 25) reste techniquement joignable au clavier (Tab) même visuellement recouvert par un gabarit déjà ouvert (z-index 40) ; sans cette garde, valider une entrée au clavier pendant qu'un autre gabarit est déjà affiché pourrait lancer un second zoom/overlay en parallèle.

## `soundToggle.ts`

Bouton fixe (coin haut-gauche, symétrique de `siteMenu.ts` à droite) qui coupe/réactive les sons ponctuels (`audio/soundEffects.ts`, voir aussi `audio/CLAUDE.md`). `createSoundToggle(initialMuted, onToggle)` gère son propre état visuel (icône haut-parleur/haut-parleur barré en SVG inline, pas d'emoji — rendu inconsistant selon la plateforme/OS) et appelle `onToggle(muted)` à chaque clic ; `main.ts` s'en sert pour piloter `soundEffects.setMuted()`.

- **Même classe CSS que `.site-menu__toggle`** (`.sound-toggle`, `style.css`, sélecteurs combinés) : bouton rond, verre dépoli, même `z-index: 25` (masqué derrière `.loading` puis `.link-overlay`, cohérent avec `siteMenu.ts` ci-dessus) — un seul endroit à ajuster si le style change.
- **Pas de retour conservé côté `main.ts`** (`createSoundToggle(...)` appelé sans assigner à une variable) — contrairement à `siteMenu`, rien d'autre n'a besoin de fermer ce bouton (pas de panneau à refermer, juste un toggle) ni de lire son état ailleurs.
- Coché "actif" par défaut (son non coupé) — n'implique pas qu'un son puisse jouer avant le premier geste utilisateur : la politique d'autoplay des navigateurs bloque de toute façon l'`AudioContext` jusque-là, voir `audio/CLAUDE.md`.

## Convention générale pour tout nouvel élément DOM ajouté ici

- Jamais de framework — DOM API directe (`document.createElement`, `innerHTML` pour du contenu statique).
- Tout élément interactif caché doit être neutralisé avec `inert`, pas seulement visuellement caché (piège déjà rencontré avec l'ancien panneau : un élément caché seulement via CSS `opacity`/`pointer-events` reste focusable au clavier).
- Les styles vont dans `src/style.css` (pas de CSS-in-JS ni de fichiers `.module.css` — un seul fichier global, cohérent avec le reste du projet).
