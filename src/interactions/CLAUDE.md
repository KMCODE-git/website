# src/interactions/

Tout ce qui transforme un clic/survol sur un objet 3D en mouvement de caméra. Volontairement éclaté en deux modules à responsabilité unique — ni l'un ni l'autre ne connaît l'état global de l'app (ça vit dans `main.ts`).

## Répartition des rôles

- **`raycaster.ts`** détecte seulement. Il écoute `pointermove`/`pointerdown`/`pointerup` sur le canvas, fait le raycast, et appelle `onHover(id | null)` / `onClick(id | null)`. Il ne sait rien de la caméra-cible, du panneau, ni de si on est déjà "zoomé" sur quelque chose.
- **`cameraRig.ts`** anime seulement. Il reçoit un `CameraFocus` brut (`{position, target}` depuis `data/scenes.ts`) et fait le tween. Il ne sait pas ce qu'est un clic ni un panneau.
- **`main.ts`** décide. C'est lui qui possède l'état (`activeId`, `isAnimating`), branche le raycaster à `cameraRig.focus()`/`.reset()`, et synchronise l'affichage du panneau (`ui/panel.ts`) avec la fin des animations.

Si tu ajoutes un nouveau déclencheur (ex. double-clic, molette pour zoomer sur l'objet survolé...), il va presque toujours dans `main.ts` — pas dans `cameraRig.ts` qui doit rester agnostique de la source du déclenchement.

## Pourquoi la distinction clic / drag dans `raycaster.ts`

Le "clic" n'utilise pas l'event `click` du DOM (qui peut se déclencher même après un drag selon le navigateur) mais une mesure de distance entre `pointerdown` et `pointerup` (`CLICK_DRAG_THRESHOLD = 6px`). Sans ça, faire tourner la caméra avec OrbitControls (qui écoute aussi `pointerdown`/`pointerup` sur le même canvas) déclencherait parfois un faux clic-sélection à la fin du drag.

## Garde-fous à préserver dans `main.ts`

- `isAnimating` empêche de lancer un nouveau tween pendant qu'un autre tourne (`cameraRig` n'a aucune protection interne contre les appels qui se chevauchent).
- `activeId` empêche de sélectionner un deuxième objet pendant qu'on est déjà zoomé sur le premier — sans ça, `cameraRig.focus()` écraserait sa référence de retour (`preFocusState` n'est sauvegardée qu'une fois, voir son code).

## `prefers-reduced-motion`

Géré uniquement dans `cameraRig.ts` (`tweenTo`), pas dans `main.ts` ni `raycaster.ts` — c'est le bon endroit puisque c'est la seule brique qui anime réellement quelque chose. Si le réglage OS est actif, la caméra saute directement à la destination sans animation.
