# src/ui/

Overlay DOM par-dessus le canvas — tout ce qui n'est pas rendu en 3D. Le canvas seul n'est pas accessible (pas de focus, pas de lecteur d'écran), ces fichiers compensent ça.

## `panel.ts`

Panneau de contenu affiché après le tween de zoom (`main.ts` appelle `panel.show(entry)` dans le callback `onComplete` de `cameraRig.focus`, pas avant — sinon le panneau apparaît avant que la caméra ait fini de bouger).

`entry.title`/`entry.description` viennent exclusivement de Blender (via `objects/resolveEntries.ts` + `i18n/translate.ts`, voir `objects/CLAUDE.md`) — **jamais de repli sur `id`** ici. Si un objet n'a pas de `title` Blender, `entry.title` est une chaîne vide et `show()` masque carrément le `<h2>` (`title.style.display = "none"`), plutôt que d'afficher un titre vide ou l'id brut.

**Piège déjà rencontré** : un panneau caché seulement via CSS (`opacity: 0`, `pointer-events: none`) reste **focusable au clavier**. Le bouton de fermeture volait le premier `Tab` de la page alors qu'il était invisible. Fix : `root.inert = true/false` en plus des classes CSS, synchronisé dans `show()`/`hide()`. Toujours faire pareil pour tout élément caché-mais-présent dans le DOM ajouté ici.

## `accessibleNav.ts`

Fallback clavier pour les sections de contenu (Projets/À propos/...) : un bouton réel par entrée (visuellement caché via `.sr-nav__button`, visible seulement au `:focus`), appelant le même `onSelect(id)` que le raycaster — comportement identique (zoom + panneau) par les deux chemins.

Contrairement à `panel.ts`, le texte du bouton retombe sur `entry.id` quand `entry.title` est vide (`entry.title || entry.id`) — un bouton sans libellé est un vrai problème d'accessibilité (inutilisable au clavier/lecteur d'écran), alors qu'un panneau visuel sans titre reste lisible. Exception délibérée, propre à ce fichier.

**Stateful** : `createAccessibleNav()` retourne `{ setEntries(entries) }`, appelé par `main.ts` à chaque `loadScene()` pour régénérer les boutons à partir des `entries` de la scène active (`data/scenes.ts`) — les entrées ne sont plus une liste globale fixe, elles changent avec la scène.

## `sceneNav.ts`

Barre flottante toujours visible (navigation entre scènes, pas entre sections de contenu — à ne pas confondre avec `accessibleNav.ts`). Montée une fois dans `main.ts`, jamais recréée ; `setActive(sceneId)` met juste à jour le style du bouton actif à chaque changement de scène.

## `loading.ts`

Overlay plein écran (spinner + texte), affiché pendant `loadScene()` le temps que le `.glb` de la nouvelle scène charge et parse — certains modèles pèsent plusieurs dizaines de Mo, ce n'est pas instantané.

## Convention générale pour tout nouvel élément DOM ajouté ici

- Jamais de framework — DOM API directe (`document.createElement`, `innerHTML` pour du contenu statique).
- Tout élément interactif caché doit être neutralisé avec `inert`, pas seulement visuellement caché.
- Les styles vont dans `src/style.css` (pas de CSS-in-JS ni de fichiers `.module.css` — un seul fichier global, cohérent avec le reste du projet).
