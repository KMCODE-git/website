# src/interactions/

Tout ce qui touche à la caméra et au survol/clic sur un objet 3D. Volontairement éclaté en modules à responsabilité unique — aucun ne connaît l'état global de l'app (ça vit dans `main.ts`).

## Répartition des rôles

- **`raycaster.ts`** détecte seulement. Il écoute `pointermove`/`pointerdown`/`pointerup` sur le canvas, fait le raycast, et appelle `onHover(name | null)` / `onClick(name | null)` (`object.name`, pas de Custom Property `id`). Il ne sait rien de la caméra, ni de si on est déjà "zoomé" sur quelque chose.
- **`cameraRig.ts`** anime le zoom seulement. Il reçoit un `CameraFocus` brut (`{position, target}`) et fait le tween. Il ne sait pas ce qu'est un clic, ni ce qu'est une scène — `main.ts` lui fournit explicitement la pose de départ/retour à chaque appel (`focus()`/`reset(base, ...)`).
- **`parallax.ts`** anime la caméra hors zoom. Remplace l'ancienne navigation libre (OrbitControls, retiré du projet) : un léger décalage opposé au déplacement de la souris, autour de la pose de repos (`defaultCamera`, `data/scenes.ts`). Suspendu pendant un zoom.
- **`objectAnimations.ts`** anime les objets, pas la caméra : survol-lift (systématique sur tout objet `animation=true`) + les animations locales déclenchées par `animationType`/`animationTrigger` (`swing`, `swing_back`, `spin`, `bounce`, `move`, `swap`, `swap_light_color`, `screen` — voir `objects/CLAUDE.md`). Module unique plutôt que plusieurs fichiers séparés : plusieurs animations peuvent s'appliquer au même objet en même temps (ex. lift + swing), et il faut les composer avant d'écrire une seule fois sur `object.position`/`rotation` par frame — les faire vivre dans des modules indépendants qui écrivent chacun sur `object.position` les ferait s'écraser mutuellement. Exceptions : `swap` écrit directement sur les enfants de l'objet interactif (pas sur l'objet lui-même), via une structure de suivi séparée (`childSwaps`) ; `swap_light_color` écrit sur le `material`/la `PointLight` des descendants (`lightColorSwaps`) — ni l'un ni l'autre ne passe par `ObjectState`/`active`, réservé aux animations de position/rotation de l'objet interactif lui-même.
- **`main.ts`** décide. C'est lui qui possède l'état (`activeId`, `isAnimating`), branche le raycaster à `cameraRig.focus()`/`.reset()`, coordonne l'activation/désactivation de `parallax.ts` pendant un zoom, appelle `objectAnimations.setHovered()`, et décide — selon `animationTrigger` — s'il faut aussi appeler `objectAnimations.trigger()` au survol ou au clic (voir plus bas).

Si tu ajoutes un nouveau déclencheur (ex. double-clic...), il va presque toujours dans `main.ts` — pas dans `cameraRig.ts`/`parallax.ts`/`objectAnimations.ts` qui doivent rester agnostiques de la source du déclenchement.

## Plus de navigation caméra libre

OrbitControls a été retiré du projet (voir `CLAUDE.md` racine, "Interaction et caméra") : la caméra ne peut plus être orientée/déplacée par l'utilisateur. `parallax.ts` est la seule chose qui bouge la caméra hors zoom, et seulement de quelques centimètres. Ça a fait disparaître toute une classe de bugs qu'on avait avec OrbitControls (ses bornes `minDistance`/`maxDistance`/pan internes continuaient de s'appliquer même quand `controls.enabled = false`, ce qui demandait des contournements dans `cameraRig.ts`) — `cameraRig.ts` n'a plus aucune dépendance à gérer, il tween juste `camera.position` et fait `camera.lookAt()` lui-même.

## Pourquoi la distinction clic / drag reste dans `raycaster.ts`

Le "clic" n'utilise pas l'event `click` du DOM (qui peut se déclencher même après un drag selon le navigateur, ex. une sélection de texte accidentelle) mais une mesure de distance entre `pointerdown` et `pointerup` (`CLICK_DRAG_THRESHOLD = 6px`). Ce n'est plus lié à un conflit avec OrbitControls (qui n'existe plus) mais reste une protection utile contre un clic mal interprété après un léger mouvement de souris involontaire.

## `animationTrigger` : qui décide quand `objectAnimations.trigger()` est appelé

`objectAnimations.ts` expose `trigger(object, animationType)` mais ne l'appelle jamais lui-même — c'est `main.ts` qui lit `object.userData.animationTrigger` ("hover" ou "click") et décide :
- dans `setHovered()` : si `animationTrigger === "hover"` **et** `animationType !== "zoom"`, appelle `trigger()` au moment où l'objet devient survolé (pas à chaque `pointermove` tant qu'il reste survolé).
- dans `selectEntry()` : si `animationType === "zoom"`, passe par `cameraRig.focus()` (jamais par `animationTrigger`, voir plus bas) ; sinon, si `animationTrigger === "click"`, appelle `trigger()`.

Le survol-lift, lui, n'est **pas** concerné par `animationTrigger` — `objectAnimations.setHovered()` le déclenche systématiquement sur tout objet `animation=true`, qu'il ait ou non un `animationType`/`animationTrigger`.

`"screen"` ne passe **pas** par `trigger()` du tout — voir `objects/CLAUDE.md`. Il est géré à part, directement dans `setHovered()` (`objectAnimations.ts`), couplé au survol comme le lift : recherche des sous-objets `animationType="screen"` dans la hiérarchie de l'objet qui vient d'être (dé)survolé, et bascule leur cible d'allumage en conséquence. Un clic ne déclenche jamais "screen" (pas de moment naturel "fin de survol" pour l'éteindre).

## Pourquoi `"zoom"` échappe à `animationTrigger`

Décision prise faute de précision explicite du besoin, à corriger si ce n'est pas voulu : un zoom caméra déclenché au survol casserait la règle "sortie uniquement par clic ailleurs/Échap" (un utilisateur qui bouge juste la souris sur l'objet se retrouverait zoomé sans l'avoir demandé, sans geste symétrique évident pour dézoomer). `animationType === "zoom"` est donc géré à part dans `selectEntry()`, toujours au clic, indépendamment de `animationTrigger`.

## Garde-fous à préserver dans `main.ts`

- `isAnimating` empêche de lancer un nouveau tween pendant qu'un autre tourne (`cameraRig` n'a aucune protection interne contre les appels qui se chevauchent).
- `activeId` empêche de sélectionner un deuxième objet pendant qu'on est déjà zoomé sur le premier.

## Sortir d'un zoom

Pas de bouton fermer (plus de panneau) : un clic n'importe où pendant un zoom, ou la touche Échap, appelle `closeActive()` dans `main.ts`, qui appelle `cameraRig.reset(sceneConfig.defaultCamera, ...)` puis réactive `parallax.ts`.

## `prefers-reduced-motion`

Géré indépendamment dans chacun des modules qui animent réellement quelque chose :
- `cameraRig.ts` (`tweenTo` saute directement à la destination),
- `parallax.ts` (aucun décalage appliqué, la caméra reste rivée à `defaultCamera`),
- `objectAnimations.ts` : le survol-lift, `screen` et `swap_light_color` (couplés au survol pour le premier, au clic pour le second) sautent directement à leur cible (pas d'easing/fondu) ; `swing`/`swing_back`/`spin`/`bounce`/`move` sont des mouvements purs et sont **entièrement désactivés** (`trigger()` ne fait rien) plutôt que joués instantanément — sauter à l'état final n'aurait aucun sens pour eux, ils reviennent de toute façon à la position de repos. `swap` suit la même règle (désactivé, pas de saut direct au résultat final) par cohérence avec les autres one-shot, même s'il ne revient pas au repos lui — à revoir si l'échange lui-même (indépendamment de sa transition animée) doit rester actif pour ces utilisateurs. `swap_light_color` fait le choix inverse : le changement de couleur reste actif (juste sans fondu), car contrairement à un mouvement, ne rien voir se passer au clic serait plus déroutant qu'un changement instantané.

Pas dans `main.ts` ni `raycaster.ts`, qui ne font qu'orchestrer/détecter.
