# src/objects/

Construction du contenu 3D. `objects/scenes/` contient un fichier par scène (`office.ts`...), chacun exportant une fonction `build<Nom>Scene(): Promise<SceneAssets>` (`{ group, interactiveObjects }`), enregistrée dans `objects/scenes/index.ts` (`SCENE_BUILDERS`). `loader.ts` contient les utilitaires génériques partagés par toutes les scènes.

## Pipeline d'import `.glb` (pattern à répliquer pour chaque nouvelle scène)

1. Modéliser dans Blender, exporter en `.glb` (glTF Binary, "+Y Up" coché, **"Custom Properties" coché** — voir plus bas) vers `public/models/<nom>.glb`.
2. Charger avec `loadModel(path)` (`loader.ts`) — ça active `castShadow`/`receiveShadow` sur tous les meshes (GLTFLoader ne le fait pas par défaut).
3. **Toujours vérifier l'orientation et la position après un premier import** — voir la checklist ci-dessous.
4. Toute fonction `build*Scene()` est `async` (chargement réseau) — `main.ts` gère déjà l'`await` dans `loadScene()`.

### Checklist si un modèle apparaît mal orienté ou mal placé

**Rotation** (typiquement "à l'envers" ou tourné à 90°) :
- Un objet peut avoir une rotation propre à `0,0,0` dans Blender (panneau N) tout en étant visuellement retourné dans Three.js. Cause fréquente : rotation faite en **mode Édition** (sélection de tous les sommets puis `R`) plutôt qu'en **mode Objet** — ça modifie les données du maillage sans toucher au champ `Rotation` de l'objet, donc invisible dans les vérifications habituelles.
- Le fix côté Blender existe (repasser en mode Objet, appliquer la rotation, `Ctrl+A`, réexporter) mais le plus rapide est souvent de corriger directement en code après chargement :
  ```ts
  model.rotation.x = Math.PI; // ou .z selon l'axe concerné
  ```
- Pour diagnostiquer l'axe : observer une capture du rendu réel (`npm run dev` + screenshot), pas seulement le viewport Blender.

**Position verticale** (objet "enterré" ou flottant) :
- L'origine choisie dans Blender à la modélisation détermine où l'objet atterrit une fois ajouté à `(0,0,0)`. Plutôt que d'imposer une convention d'origine stricte à chaque export, on recale automatiquement après chargement avec la bounding box réelle (pattern utilisé dans chaque scène) :
  ```ts
  const bounds = new THREE.Box3().setFromObject(model);
  model.position.y -= bounds.min.y; // pose la base du modèle exactement au sol
  ```

### Calibrage des dimensions

Aucun calcul automatique de mise à l'échelle — la caméra (`defaultCamera`/`distance`/`panBounds`/`polarAngle`/`azimuthAngle`, tous définis par scène dans `data/scenes.ts`) est calée à l'œil par itération (`npm run dev`, ajuster, recharger) une fois le modèle vu en vrai.

## Rendre un objet cliquable : tout part de Blender, `data/scenes.ts` ne sert qu'à surcharger

Un objet devient cliquable en lui posant des **Custom Properties** dans Blender (Object Properties → Custom Properties → "+") — **aucune entrée dans `data/scenes.ts` n'est nécessaire pour que ça fonctionne** :

- **`action`** (obligatoire, **Boolean** — attention, le "+" de Blender crée un Float par défaut, il faut changer le Type manuellement) — le vrai déclencheur du clic. Doit valoir `true`. Un objet peut porter un `id` (pour d'autres besoins) sans être cliquable si `action` est absent ou `false` — voir `collectInteractiveObjects()` (`loader.ts`) et `findInteractiveAncestor()` (`interactions/raycaster.ts`), qui exigent tous les deux `action === true && id`.
- **`id`** (obligatoire, String) — **unique par objet**. Poser le même `id` (ex. `"cliquable"`) sur deux objets différents les rend ambigus : `objects/resolveEntries.ts` les détecte et les **exclut tous les deux** (avec un `console.warn`) plutôt que de deviner lequel garder. Un objet = un id. Si plusieurs objets partagent le même *type* de contenu, donne-leur des ids distincts (`plant-1`, `plant-2`...).
- **`title`** (optionnel, String) — clé de traduction affichée comme titre du panneau (voir i18n plus bas). Absent → **le panneau n'affiche aucun titre** (`ui/panel.ts` masque le `<h2>`) ; seul `ui/accessibleNav.ts` retombe sur l'`id` brut pour le libellé de son bouton, par nécessité d'accessibilité (un bouton sans texte est inutilisable au clavier/lecteur d'écran).
- **`description`** (optionnel, String) — clé de traduction affichée comme texte du panneau. Absent → chaîne vide.

**Condition indispensable à l'export** : cocher **"Custom Properties"** dans les réglages d'export glTF (sinon ces propriétés ne sont jamais écrites dans le fichier). GLTFLoader copie automatiquement les `extras` d'un nœud glTF dans `object.userData` — donc `userData.action`/`id`/`title`/`description` sont déjà là au chargement, sans rien coder.

### i18n (placeholder actuel, vraie traduction future)

`title`/`description` posés dans Blender ne sont pas du texte final mais des **clés de traduction** (convention : `"title.<id>"`, `"description.<id>"`, ex. `"title.projects"`). Les traductions vivent dans `src/i18n/locales/fr.json`/`en.json` (objet plat `{ "title.projects": "Projets" }`) ; `src/i18n/translate.ts` (`translate(key)`) importe **`fr.json` par défaut** (seule langue branchée pour l'instant — `en.json` existe mais n'est pas encore importé, en attendant un vrai sélecteur de langue) et, tant qu'une clé n'y a pas de traduction, **affiche la clé brute telle quelle** — volontaire, pour que ce qui reste à traduire soit visible plutôt que masqué derrière du texte vide. `objects/resolveEntries.ts` appelle `translate()` sur les deux champs avant de construire chaque `PortfolioEntry`.

Côté code, `collectInteractiveObjects(model)` (`loader.ts`) récupère tout objet portant `userData.action === true && userData.id`, puis `objects/resolveEntries.ts` fusionne pour chacun : **Blender (traduit) < surcharge `data/scenes.ts` < calcul automatique** (focus uniquement) :
```ts
const { entries, interactiveObjects } = resolveEntries(allInteractiveObjects, meta.entries, camera.fov, defaultCameraPosition);
```
`interactions/raycaster.ts` remonte la hiérarchie de parents jusqu'à trouver `userData.action === true && userData.id` — donc poser les Custom Properties sur le nœud racine de l'objet (pas forcément sur chaque sous-mesh) suffit à rendre tout le sous-arbre cliquable.

`data/scenes.ts` (`entries?: Record<string, PortfolioEntryOverride>`, tout optionnel) ne fournit **jamais** de `title`/`description` (exclusivement Blender) — il ne sert plus qu'à :
- ajouter des **`links`** (liste de liens) — pas d'équivalent Blender pour une liste, c'est le seul champ qu'on renseigne systématiquement ici,
- surcharger le `focus` auto-calculé si le résultat par défaut ne convient pas (voir plus bas).

Ancienne approche (avant cette convention) : appeler `model.getObjectByName("NomExact")` et poser `userData.id`/`userData.interactive` à la main en code, pour chaque objet un par un — encore utilisé pour des effets qui ne sont *pas* des sections cliquables (néon, panneaux LED, voir plus bas), mais plus pour l'interactivité.

### Focus caméra automatique

`focus` est **optionnel** dans une surcharge. S'il est omis, `computeAutoFocus()` (`objects/autoFocus.ts`) le calcule au chargement à partir de la bounding box réelle de l'objet et du FOV de la caméra, pour un cadrage qui remplit ~75% de l'écran — plus besoin de calibrer une position/cible à la main pour chaque nouvel objet. L'approche est heuristique (direction déduite de la position de la caméra par défaut de la scène) : correcte pour un objet posé sur un bureau vu depuis la vue par défaut, moins fiable pour une orientation atypique — dans ce cas, préciser `focus` à la main comme pour `projects`/`contact` (calibrés par capture d'écran, voir leurs commentaires dans `data/scenes.ts`).

### Script de scaffold (`npm run scaffold`)

`scripts/scaffold-scenes.mjs` inspecte la scène active du serveur de dev (lancer `npm run dev` dans un autre terminal d'abord) via un hook dev-only (`window.__kmcode_scaffold__`, défini dans `main.ts`) et compare avec `data/scenes.ts` :
- signale les **ids dupliqués** (posés sur plusieurs objets — ceux-là sont réellement cassés, à corriger),
- indique pour chaque objet si son titre vient de **Blender**, ou s'il **manque** (le panneau n'affichera alors aucun titre — la correction se fait dans Blender, pas dans `data/scenes.ts` qui ne peut plus fournir de titre),
- signale les **surcharges orphelines** (déclarées dans `data/scenes.ts` mais sans objet correspondant dans la scène actuelle).

Ne modifie jamais `data/scenes.ts` directement — imprime juste ce qu'il faut coller, pour garder un humain dans la boucle sur le contenu.

### Script de scaffold i18n (`npm run scaffold:i18n`)

`scripts/scaffold-i18n.mjs` — même mécanisme (`window.__kmcode_scaffold__`, `npm run dev` requis dans un autre terminal), mais pour les traductions : liste toutes les clés `title`/`description` posées dans Blender pour la scène active, puis les ajoute (placeholder `"TODO"`) dans `i18n/locales/fr.json` **et** `en.json` si elles n'y sont pas déjà. Idempotent et non-destructif — une clé déjà traduite (valeur ≠ manquante) n'est jamais réécrite, seules les clés absentes sont ajoutées. À relancer après chaque nouvel objet cliquable ajouté dans Blender pour ne pas oublier de clé de traduction.

## Éclairage émissif / effets de lumière sur un objet importé

Pattern recommandé, utilisé dans `objects/scenes/office.ts` pour le néon et les panneaux LED : modéliser juste la géométrie dans Blender avec un nom identifiable (`mesh.name`, ex. `NeonStrip`), **sans émission Blender** (elle ne correspond à aucune unité calibrée côté Three.js et sature facilement l'image une fois passée dans notre pipeline bloom/tone-mapping), puis assigner matériau + lumière en code :
```ts
const mesh = model.getObjectByName("NeonStrip");
if (mesh instanceof THREE.Mesh) {
  mesh.material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 });
  const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
  const light = new THREE.PointLight(color, 1, 3, 2);
  light.position.copy(center);
  group.add(light);
}
```
Deux briques séparées : le matériau émissif fait *briller l'objet lui-même* (et déclenche le bloom si l'intensité dépasse le seuil de `postprocessing.ts`, actuellement `0.95`), la `PointLight` positionnée au même endroit *éclaire ce qui l'entoure* — sans la lumière, l'objet brille mais ne projette rien autour de lui. Se référer à `office.ts` (fonction `litWarm`) pour les ordres de grandeur d'intensité déjà calés.
