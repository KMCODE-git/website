# src/objects/

Construction du contenu 3D. `objects/scenes/office.ts` exporte `buildOfficeScene(): Promise<SceneAssets>` (`{ group, model, interactiveObjects }`), appelée une fois par `main.ts` (`init()`) — site à page unique, voir `CLAUDE.md` racine "Page unique". `loader.ts` contient les utilitaires génériques. `model` (distinct de `group`, qui ajoute aussi les `PointLight` créées en code — voir `litWarm()`) est exposé séparément pour `interactions/sceneEntrance.ts`, qui a besoin des enfants directs du modèle chargé, pas de `group`.

## Pipeline d'import `.glb`

1. Modéliser dans Blender, exporter en `.glb` (glTF Binary, "+Y Up" coché, **"Custom Properties" coché** — voir plus bas) vers `public/models/<nom>.glb`.
2. Charger avec `loadModel(path)` (`loader.ts`) — ça active `castShadow`/`receiveShadow` sur tous les meshes (GLTFLoader ne le fait pas par défaut).
3. **Toujours vérifier l'orientation et la position après un premier import** — voir la checklist ci-dessous.
4. `buildOfficeScene()` est `async` (chargement réseau) — `main.ts` gère déjà l'`await` dans `init()`.

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

Aucun calcul automatique de mise à l'échelle — la caméra (`defaultCamera` dans `data/scenes.ts`, seule pose caméra depuis que la navigation libre a été retirée, voir `interactions/CLAUDE.md`) est calée à l'œil par itération (`npm run dev`, ajuster, recharger) une fois le modèle vu en vrai.

## Rendre un objet interactif : tout part de Blender, `data/scenes.ts` ne sert qu'à surcharger le focus

Un objet devient interactif en lui posant des **Custom Properties** dans Blender (Object Properties → Custom Properties → "+") — **aucune entrée dans `data/scenes.ts` n'est nécessaire pour que ça fonctionne**, et pas besoin de poser d'`id` non plus : `object.name` (déjà unique par objet dans Blender, sans rien configurer) sert d'identifiant partout où il en faut un.

- **`animation`** (**Boolean** — attention, le "+" de Blender crée un Float par défaut, il faut changer le Type manuellement) — rend un objet interactif : survol → curseur + léger mouvement vers le haut (systématique, voir `interactions/objectAnimations.ts`), clic → activé. Pas la seule façon de devenir interactif : `link` (voir plus bas) suffit aussi à lui seul. Voir `collectInteractiveObjects()` (`loader.ts`) et `findInteractiveAncestor()` (`interactions/raycaster.ts`), qui acceptent `animation === true` **ou** `link` défini.
- **`animationTrigger`** (String, `"hover"` ou `"click"`) — décide **quand** `animationType` se déclenche (voir `interactions/CLAUDE.md`). Sans effet sur le survol-lift ci-dessus, toujours actif. **`animationType="zoom"` ignore cette propriété et reste toujours déclenché au clic** (voir `interactions/CLAUDE.md`, "Pourquoi `zoom` échappe à `animationTrigger`").
- **`animationType`** (String) — décide **quoi** se joue. Valeurs reconnues par le code :
  - `"zoom"` — tween caméra vers un focus (voir plus bas).
  - `"swing"` — oscillation autour de l'axe vertical, amplitude en ease-out (`Math.pow(1-u, 2)`, forte dès le départ puis s'atténue), pivot à la **base** de l'objet (pas son origine, voir `pivotOffset`/`pivotedPositionOffset()` dans `objectAnimations.ts`) — sans ça la rotation se fait autour du centre géométrique et la base "flotte"/bouge avec le reste.
  - `"swing_back"` — bascule vers l'arrière puis retour, un seul mouvement (pas d'oscillation répétée contrairement à `swing`), pivot à la base également.
  - `"spin"` — tour complet (360°) autour de l'axe vertical, vitesse **linéaire** (pas d'easing), pivot à la base.
  - `"bounce"` — rebonds décroissants (façon balle qui retombe), amplitude en ease-out, déplacement vertical uniquement (pas de rotation).
  - `"move"` — translation dans une petite zone puis retour. **Pas de vraie détection de collision** — le rayon est calculé au déclenchement, proportionnel à l'empreinte au sol de l'objet lui-même (`MOVE_RADIUS_FACTOR_MIN`/`MAX` dans `objectAnimations.ts`), donc "sans entrer en contact avec d'autres objets" n'est pas garanti dans un environnement encombré, juste probable pour un objet isolé.
  - `"swing"`/`"swing_back"`/`"spin"`/`"bounce"`/`"move"` (les 5 one-shot ci-dessus) **ignorent un nouveau déclenchement tant que le précédent n'est pas terminé** (`trigger()` dans `objectAnimations.ts`, avant même de regarder l'`animationType` précis) — sans ce verrou, recliquer/re-survoler pendant l'animation réinitialise `startTime` et fait sauter l'objet instantanément à son état de repos avant de repartir, au lieu de continuer proprement (ex. `Chair`/`"spin"` : cliquer pendant la rotation la faisait sauter en arrière puis repartir de zéro).
  - `"swap"` — échange la position de deux **enfants directs** de l'objet interactif, tirés au hasard à chaque déclenchement (jamais systématiquement la même paire) — contrairement aux autres one-shot, ne revient jamais au repos : le but est de rebattre durablement l'ordre (ex. `Triptych` avec ses enfants `Triptych_1/2/3`). Écrit sur `position.z` (pas `.y`) : l'export glTF convertit le Z-up de Blender en Y-up, ce qui remappe l'axe **Y de Blender** (l'axe le long duquel des enfants sont typiquement espacés côté Blender) sur **Z côté Three.js** — vérifié à l'implémentation (les enfants du Triptych ont un Y identique en Three.js, seul Z varie). Se pose sur l'objet **parent** (`animation=true` + `animationType="swap"`), pas sur les enfants eux-mêmes.
  - `"swap_light_color"` (ex-`"swap_color"`) — fait avancer d'un cran une palette cyclique de couleurs (`LIGHT_COLOR_PALETTE` dans `objectAnimations.ts` : blanc chaud (défaut) → rouge → vert → violet → rose → cyan → retour au blanc chaud) appliquée à **tous les descendants** de l'objet interactif qui portent une `PointLight` associée (`mesh.userData.emissiveLight`, posé par `litWarm()` dans `objects/scenes/office.ts`) : met à jour à la fois le `material.emissive` du mesh et la couleur de sa lumière, en fondu (~600ms), pour rester cohérent visuellement (sans ça la surface et la lumière qu'elle projette se désynchroniseraient). Utilisé par `Led_pannels` (13 panneaux enfants `Led_pannel1..13`) — un clic change la couleur d'ambiance de tout le groupe en une fois, pas panneau par panneau.
    - **`emissiveIntensity` calibrée par teinte, pas une valeur unique pour toute la palette** : à intensité identique, une teinte comme le vert/cyan (poids élevé dans la formule de luminance Rec.709 utilisée aussi par le seuil de bloom, voir `postprocessing.ts`) paraît nettement plus lumineuse qu'un bleu/violet (poids très faible) — sans compensation, cycler dans la palette donnait l'impression que certaines couleurs "n'allument pas" autant que d'autres. Chaque teinte a son `intensity` calculée (`calibratedLightColor()`) pour retomber sur la même luminance perçue que le blanc chaud par défaut (`TARGET_LUMINANCE`).
    - **`emissiveIntensity` recalculée depuis la couleur courante à chaque frame du fondu, jamais interpolée en parallèle de la couleur** : chaque teinte n'est calibrée (`intensity × luminance-couleur = TARGET_LUMINANCE`) qu'à ses propres extrémités — interpoler `intensity` et `emissive` séparément (linéairement, chacun de son côté) fait diverger leur produit à mi-fondu (l'un monte pendant que l'autre descend, sans repasser par la cible), donnant un halo qui s'allume fort avant de retomber à l'intensité normale. Fix : `emissiveIntensity = TARGET_LUMINANCE / relativeLuminance(couleurInterpoléeDeCetteFrame)` dans `updateLightColorSwaps()`, pas de champs `fromIntensity`/`toIntensity` stockés — la luminance perçue reste ~constante sur tout le fondu, pas seulement aux deux bouts.
    - Contrairement aux autres one-shot de mouvement pur, **pas désactivé sous `prefers-reduced-motion`** : la couleur (et l'intensité) change quand même, juste instantanément (sans fondu) plutôt que disparaître — un clic qui ne produit visiblement rien serait plus déroutant qu'utile ici, alors que pour `swing`/`bounce`/etc. l'absence de mouvement est justement ce que l'utilisateur demande.
  - `"screen"` — cas particulier, pas un `animationType` de plus dans la liste ci-dessus mais un **effet indépendant couplé directement au survol** (comme le survol-lift, pas une timeline fixe). Se pose **uniquement sur le sous-objet** à illuminer (ex. `Mac_screen`), jamais sur l'objet interactif racine — celui-ci n'a besoin que d'`animation=true` + `animationTrigger="hover"` (**pas `"click"`** : un clic n'a pas de moment naturel "fin de survol" pour éteindre l'écran, donc "screen" ignore ce cas), son propre `animationType` peut rester vide. Dès que l'objet racine devient survolé, le code cherche dans toute sa hiérarchie les descendants portant `animationType="screen"` et anime leur matériau en continu (`MeshStandardMaterial` attendu, sinon avertissement console) tant que le survol dure ; ça s'éteint dès que le survol s'arrête. Pas de Custom Property supplémentaire à poser sur le parent pour "désigner" quel enfant illuminer — le sous-objet se désigne lui-même.
    - **Piège rencontré** : deux sous-objets `screen` différents peuvent partager le **même matériau** côté Blender (mesh dupliqué sans "rendre le matériau unique" — repérable par UUID de matériau identique). Sans précaution, animer l'un allume aussi l'autre puisque c'est littéralement la même ressource. `objectAnimations.ts` clone le matériau au premier survol de chaque sous-objet (dans `getScreenGlow()`) pour garantir l'indépendance, sans dépendre d'un nouvel export Blender.
  - Un objet `animation=true` avec un `animationType` absent ou non reconnu a son survol actif (curseur + hover-lift) mais rien ne se déclenche en plus — voir `main.ts` (`selectEntry()`/`setHovered()`), en attente de futures valeurs.
- **`animationClip`** (Boolean) — **indépendante** d'`animationType`/`animationTrigger` : associe l'objet interactif à un `AnimationClip` glTF embarqué (ex. `Aquarium`, poissons/bulles — un seul clip peut couvrir plusieurs enfants/canaux). Se pose sur l'objet **racine** interactif même si le clip anime en réalité ses enfants — même logique que `swap`/`swap_light_color`, qui écrivent aussi sur les descendants alors que la Custom Property vit sur le parent. Résolution une fois au chargement (`main.ts`/`init()`) via `findClipForObject(animations, object)` (`objects/loader.ts`) : cherche d'abord un clip dont le nom correspond exactement à `object.name` (renommer l'Action Blender pour matcher, le plus robuste si plusieurs objets ont chacun leur clip un jour), sinon retombe sur le seul clip du fichier s'il n'y en a qu'un (cas actuel de l'Aquarium, clip jamais renommé côté Blender).
  - **Couplé au cycle de vie du déclencheur présent, quel qu'il soit** (`main.ts`) — pas un one-shot lancé puis oublié : si `animationTrigger="hover"`, démarré/arrêté symétriquement à l'entrée/la sortie du survol (`setHovered()`, comme `"screen"`) ; si `animationTrigger="click"`, démarré dans `selectEntry()` et arrêté dans `closeActive()` (fonctionne même si ce même clic déclenche aussi `animationType="zoom"`, comme sur `Aquarium` — indépendant de ce que fait `animationType`). Décision prise après un premier essai (`playClip()`, boucle indéfiniment une fois lancé, jamais arrêté) explicitement rejeté au profit de ce couplage symétrique.
  - Implémenté avec `THREE.AnimationMixer`/`AnimationAction` (`setClipActive(object, clip, active)` dans `interactions/objectAnimations.ts`, voir `interactions/CLAUDE.md`) : boucle indéfiniment tant qu'actif (`THREE.LoopRepeat`), **mis en pause plutôt qu'arrêté** entre deux activations (`action.paused`, pas `stop()`/`reset()`) pour reprendre exactement où la nage en était plutôt que de repartir de zéro à chaque survol/clic. Désactivé sous `prefers-reduced-motion`, comme les autres animations de mouvement pur.
- **`link`** (String, ex. `"contact"`) — **indépendante** des trois Custom Properties ci-dessus : identifie une navigation vers un panneau/une page de contenu (voir `data/links.ts`, `ui/linkOverlay.ts`), pas une animation locale. Sa seule présence suffit à rendre l'objet interactif et cliquable (clic de base toujours actif, pas besoin d'`animation=true` ni d'`animationTrigger="click"`), mais peut coexister avec `animation=true` sur le même objet si on veut aussi le hover-lift/une animation locale. La valeur choisit un gabarit dans `data/links.ts` (`LinkTemplate.type`) :
  - `"side"` — bandeau à droite (1/3 écran) + fond flouté (`contact`, `hobbies`). Pas de zoom caméra, `activeId` (`main.ts`) n'est pas touché ; ferme au clic sur le fond flouté ou à Échap.
  - `"page"` — zoom caméra **profond** préalable dans l'objet (`projects`) : réutilise `activeId`/`isAnimating`/`cameraRig.focus()` comme `animationType="zoom"`, mais avec un cadrage bien plus serré (`computeAutoFocus(..., LINK_PAGE_ZOOM_FILL_FRACTION)` dans `main.ts`, `fillFraction=3.5` contre `0.75` pour un zoom normal — voir `objects/autoFocus.ts`) pour donner l'impression d'entrer dans l'objet plutôt que de simplement le regarder de près. La page plein écran ne s'affiche qu'une fois le zoom terminé (`onComplete` de `cameraRig.focus()`), en fondu (`ui/linkOverlay.ts`/`style.css`), pas en fondu simultané au zoom. Ferme via un **bouton fermer** dédié (pas de "dehors" cliquable sur un panneau plein écran) ou Échap — les deux repassent par `closeActive()` (`main.ts`) pour aussi redézoomer la caméra, jamais juste `linkOverlay.close()` seul (sinon la caméra resterait zoomée indéfiniment).
  - Contenu actuellement en placeholder façon clés i18next (ex. `"contact.title"`), pas de vrai texte/traduction branché.

**Condition indispensable à l'export** : cocher **"Custom Properties"** dans les réglages d'export glTF (sinon ces propriétés ne sont jamais écrites dans le fichier). GLTFLoader copie automatiquement les `extras` d'un nœud glTF dans `object.userData` — donc `userData.animation`/`animationType` sont déjà là au chargement, sans rien coder. **Vérifier après export** que ces propriétés ont bien survécu si le fichier passe par un pipeline de compression/optimisation (Draco, ré-export) — un outil de compression mal configuré peut discrètement supprimer les `extras` glTF (déjà rencontré, voir `git log` sur ce fichier).

Côté code, `collectInteractiveObjects(model)` (`loader.ts`) récupère tout objet portant `userData.animation === true`, puis `objects/resolveEntries.ts` résout pour chacun (identifié par son `object.name`) son focus caméra : **calcul automatique < surcharge `data/scenes.ts`** :
```ts
const { entries, interactiveObjects } = resolveEntries(allInteractiveObjects, sceneConfig.entries, camera.fov, defaultCameraPosition);
```
`interactions/raycaster.ts` remonte la hiérarchie de parents jusqu'à trouver `userData.animation === true` — donc poser la Custom Property sur le nœud racine de l'objet (pas forcément sur chaque sous-mesh) suffit à rendre tout le sous-arbre interactif.

`data/scenes.ts` (`entries?: Record<string, FocusOverride>`, tout optionnel, clés = `object.name`) ne sert donc qu'à surcharger le `focus` auto-calculé si le résultat par défaut ne convient pas (voir plus bas) — aucun autre contenu (pas de titre/description/liens depuis le retrait du panneau, voir `CLAUDE.md` racine "Interaction et caméra").

Ancienne approche (avant cette convention) : appeler `model.getObjectByName("NomExact")` en code pour chaque objet un par un — encore utilisé pour des effets qui ne sont *pas* des objets interactifs (néon, panneaux LED, voir plus bas), mais plus pour l'interactivité elle-même.

### Focus caméra automatique

`focus` est **optionnel** dans une surcharge. S'il est omis, `computeAutoFocus()` (`objects/autoFocus.ts`) le calcule au chargement à partir de la bounding box réelle de l'objet et du FOV de la caméra, pour un cadrage qui remplit ~75% de l'écran — plus besoin de calibrer une position/cible à la main pour chaque nouvel objet. L'approche est heuristique (plus grande dimension de la bounding box traitée comme "hauteur", direction d'approche déduite de la position de la caméra par défaut de la scène) : correcte pour un objet ~cubique posé près du centre de la scène, moins fiable pour un objet très plat/large, très petit (la distance calculée peut tomber sous `camera.near`), ou situé loin de la zone habituelle — dans ce cas, préciser `focus` à la main comme dans les entrées déjà présentes dans `data/scenes.ts` (calibrées par capture d'écran).

### Script de scaffold (`npm run scaffold`)

`scripts/scaffold-scenes.mjs` inspecte le modèle chargé sur le serveur de dev (lancer `npm run dev` dans un autre terminal d'abord) via un hook dev-only (`window.__kmcode_scaffold__`, défini dans `main.ts`) et compare avec `data/scenes.ts` :
- signale les **noms dupliqués** (deux objets interactifs portant le même `object.name` — ceux-là sont réellement cassés, à corriger dans Blender),
- pour un objet `link` : indique si sa valeur a un template dans `data/links.ts` (`KNOWN_LINKS`) ou **non reconnue** (le clic n'ouvrira rien) — ne vérifie ni `animationType` ni `animationTrigger` pour ces objets, non pertinents pour `link`,
- pour les autres : indique si son `animationType` est reconnu par le code, ou **absent/non géré** (rien ne se déclenche pour cet objet),
- pour `animationType="zoom"` : indique si son focus vient d'une **surcharge** `data/scenes.ts` ou du **calcul automatique** ; pour les autres types reconnus : indique si son `animationTrigger` est valide (`"hover"`/`"click"`) ou **non reconnu** (l'effet ne se déclenchera jamais),
- signale les **surcharges orphelines** (déclarées dans `data/scenes.ts` mais sans objet correspondant dans le modèle actuel).

Ne modifie jamais `data/scenes.ts` directement — imprime juste ce qu'il faut vérifier/coller, pour garder un humain dans la boucle sur le contenu.

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
