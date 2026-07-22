# KMCODE

Site personnel avec une expérience Three.js en plein écran, déployé sur Vercel derrière le domaine **kmcode.fr**.

## Objectif du projet

Le site EST l'expérience 3D : une scène Three.js interactive en plein écran (pas une simple landing page avec un hero 3D). Le contenu, la navigation et les interactions doivent être pensés à travers la scène 3D elle-même.

## Stack

- **Three.js** en vanilla TypeScript (pas de React Three Fiber)
- **Vite** comme bundler / dev server
- **TypeScript** strict
- Déploiement sur **Vercel**, domaine custom `kmcode.fr`

## Structure

```
index.html                    # point d'entrée : <canvas id="scene"> + <div id="panel"> (overlay contenu)
src/main.ts                     # orchestration : loadScene(id), état d'interaction, boucle d'animation
src/scene.ts                     # THREE.Scene, background, fog
src/camera.ts                     # PerspectiveCamera + resize
src/renderer.ts                    # WebGLRenderer, tone mapping, shadow map, resize
src/controls.ts                     # OrbitControls + applyCameraConfig() (reconfigurable par scène)
src/lighting.ts                      # éclairage global 3 points (ambient/key/fill/rim), toutes scènes confondues
src/postprocessing.ts                 # EffectComposer + bloom (zones émissives uniquement)
src/data/scenes.ts                     # SceneMeta[] : caméra/bornes/contenu par scène (voir plus bas)
src/objects/loader.ts                    # loadModel(), disposeObject3D(), collectInteractiveObjects()
src/objects/scenes/<id>.ts                # un fichier par scène (voir src/objects/CLAUDE.md)
src/objects/scenes/index.ts                # registre id -> fonction de construction
src/interactions/raycaster.ts               # hover + click sur objets 3D (voir src/interactions/CLAUDE.md)
src/interactions/cameraRig.ts                 # tween caméra (vue libre <-> focus objet)
src/ui/panel.ts                                # panneau DOM overlay (voir src/ui/CLAUDE.md)
src/ui/accessibleNav.ts                          # fallback clavier, régénéré par scène
src/ui/sceneNav.ts                                 # barre flottante de navigation entre scènes
src/ui/loading.ts                                    # overlay de chargement pendant loadScene()
src/style.css                                          # reset + styles panel/nav/loading
public/models/*.glb                                      # assets 3D (servis tels quels par Vite)
vite.config.ts
tsconfig.json
```

Des `CLAUDE.md` plus détaillés existent dans certains sous-dossiers (`objects/`, `interactions/`, `ui/`) pour les conventions spécifiques à chaque brique — à consulter/enrichir en travaillant dedans.

## Architecture multi-scènes

Le site n'est plus une scène unique : `data/scenes.ts` définit un tableau `scenes: SceneMeta[]`, chacune avec son `id`, son `label` (bouton de `ui/sceneNav.ts`), sa caméra par défaut (`defaultCamera`/`distance`/`panBounds`/`polarAngle`/`azimuthAngle` — tout optionnel, repli sur des valeurs permissives dans `controls.ts` si omis), et ses `entries` (sections de contenu propres à cette scène, pas partagées). `objects/scenes/index.ts` mappe chaque `id` à sa fonction de construction Three.js (`objects/scenes/<id>.ts`).

`main.ts` expose `loadScene(sceneId)` : décharge la scène active (`disposeObject3D()` — géométries/matériaux/textures, indispensable vu que les `.glb` peuvent peser plusieurs dizaines de Mo), charge la nouvelle à la demande (pas tout au démarrage), reconfigure caméra/pan/nav clavier pour cette scène. Une seule scène est chargée en mémoire à la fois.

**Rendre un objet cliquable** ne se fait plus en code : poser une Custom Property Blender `id` sur l'objet (export glTF avec "Custom Properties" coché) — voir `src/objects/CLAUDE.md` pour le détail. `collectInteractiveObjects()` les récupère automatiquement au chargement.

## Commandes

```bash
npm install       # installer les dépendances
npm run dev       # serveur de dev Vite (hot reload)
npm run build     # tsc -b && vite build -> dist/
npm run preview   # preview du build de prod en local
npm run lint      # tsc --noEmit (vérif de types)
npm run scaffold  # avec `npm run dev` lancé ailleurs : audite data/scenes.ts vs la scène active (voir src/objects/CLAUDE.md)
npm run scaffold:i18n  # avec `npm run dev` lancé ailleurs : ajoute les clés title/description manquantes (placeholder "TODO") dans i18n/locales/*.json
```

## Conventions

- Scène découpée par responsabilité (`scene.ts`, `camera.ts`, `renderer.ts`, `controls.ts`, `objects/`, `interactions/`, `ui/`, `data/`) plutôt qu'un seul fichier monolithique. `main.ts` reste le seul point d'orchestration (câble les modules entre eux, ne contient pas de logique métier propre).
- Toujours gérer le `resize` de la fenêtre (aspect ratio caméra + `renderer.setSize` + `composer.setSize`).
- Pixel ratio capé à 2 (`Math.min(window.devicePixelRatio, 2)`) pour éviter de surcharger le rendu sur écrans Retina/HiDPI.
- Pas de dépendances UI framework (React, Vue...) sauf décision explicite de changer d'approche. Côté runtime/production, tout ce qui a été ajouté (OrbitControls, GLTFLoader, EffectComposer/bloom) vient de `three/examples/jsm/*` — `dependencies` ne liste toujours que `three`. Seule exception : `playwright` en **devDependency** (utilisé par `scripts/scaffold-scenes.mjs`, jamais bundlé dans le site déployé) — à garder comme réflexe (dev vs runtime) avant d'ajouter un paquet.
- Assets 3D lourds (`.glb`) : servis depuis `public/models/`, chargés à la demande (une scène à la fois, jamais tout au démarrage) via `objects/loader.ts` — voir "Architecture multi-scènes" plus haut.
- Contenu (textes, liens, position de focus caméra) centralisé dans `data/scenes.ts`, par scène — ne pas coder de textes en dur ailleurs.
- Accessibilité non négociable malgré le tout-canvas : fallback clavier (`ui/accessibleNav.ts`), respect de `prefers-reduced-motion` (`interactions/cameraRig.ts`), éléments cachés visuellement mais interactifs neutralisés avec `inert` (pas juste `opacity`/`display`).

## Déploiement

- Repo Git : https://github.com/KMCODE-git/website.git (auth SSH dédiée, voir alias `github-kmcode` dans `~/.ssh/config`)
- Vercel détecte automatiquement le framework Vite (build command `npm run build`, output `dist`).
- Compte Vercel créé, projet lié au repo GitHub ci-dessus (déploiement continu actif sur les pushs vers `main`).
- Registrar du domaine : **Hostinger**. DNS configuré pour pointer vers Vercel :
  - `A @ → 216.198.79.1` (apex `kmcode.fr`)
  - `CNAME www → cc6bb941b1cb0539.vercel-dns-017.com` (`www.kmcode.fr`)
  - Les enregistrements mail Hostinger existants (MX, SPF/DMARC, DKIM, autodiscover/autoconfig) ont été laissés intacts.
- Domaine `kmcode.fr` connecté et validé côté Vercel. `kmcode.fr` répond en HTTPS ; `www.kmcode.fr` en cours de finalisation du certificat SSL côté Vercel (normal après ajout de domaine, se résout automatiquement).

## État actuel du projet

- ⚠️ **`public/models/office.glb` (125 Mo) n'est pas dans le repo Git** — au-delà de la limite de 100 Mo par fichier de GitHub, un push le refuserait (voir `.gitignore`). Tant que ce n'est pas réglé (Git LFS ou stockage externe type Vercel Blob, à choisir), la scène `office` ne peut pas charger son modèle en production même si le déploiement Vercel réussit par ailleurs. Voir "Prochaines étapes" #1.
- Concept artistique : navigation entre plusieurs scènes 3D indépendantes (barre flottante `ui/sceneNav.ts`), chaque scène ayant potentiellement ses propres objets cliquables/contenu.
- Une seule scène en place pour l'instant : `"office"`, un intérieur scandinave lumineux — bureau, chaise, plantes, cadres muraux, panneaux LED hexagonaux + néon assortis en éclairage chaud (`objects/scenes/office.ts`).
- Caméra par scène calibrée (`data/scenes.ts`) : vue de 3/4 à l'arrivée, zoom max = cadrage d'arrivée, pan borné pour ne pas sortir de la pièce (y compris via Cmd/Ctrl+glisser).
- Éclairage global clair/neutre adapté à un style scandinave (`lighting.ts`), fond de scène assorti (`scene.ts`), accents chauds néon/LED gérés par la scène elle-même.
- Interaction clic-pour-zoomer opérationnelle sur une dizaine d'objets (Custom Properties Blender `action`/`id`, voir `objects/CLAUDE.md`). Survol (point blanc flottant qui disparaît pendant le zoom), clic → tween caméra + panneau. Une fois zoomé, on entre dans un état "interaction" dont on ne sort **que par le bouton fermer du panneau** — Échap et le clic ailleurs ne dézooment plus (volontaire, `main.ts`, pour laisser la place à une future interaction sur l'objet zoomé lui-même, ex. secousse au clic). Fallback clavier, `prefers-reduced-motion` respectés.
- Focus caméra de zoom : calculable automatiquement depuis la géométrie de l'objet (`objects/autoFocus.ts`) si `entries[id].focus` est omis — l'heuristique (plus grande dimension de la bounding box = "hauteur" à cadrer, direction d'approche unique par scène) se trompe pour un objet très plat/large (ex. `tryptich`), très petit (la distance calculée peut tomber sous `camera.near`, ex. `apple_watch`), ou hors des `panBounds` de la scène (ex. `mario_bross`, corrigé en relâchant aussi les `panBounds` pendant le tween, voir `interactions/cameraRig.ts`). Plusieurs entrées de `data/scenes.ts` utilisent donc un focus calibré à la main.
- i18n en préparation : `title`/`description` posés dans Blender sont des clés de traduction (`"title.<id>"`), résolues par `i18n/translate.ts` depuis `i18n/locales/fr.json` (langue active par défaut ; `en.json` existe déjà mais n'est pas encore branché) — tant qu'une clé n'a pas de traduction, elle s'affiche brute pour rester visible. `npm run scaffold:i18n` pré-remplit les clés manquantes avec un placeholder `"TODO"`. `public/models/flag_en.glb`/`flag_fr.glb` (petits modèles de drapeaux) sont déjà présents mais pas encore intégrés à une scène — probablement pour un futur sélecteur de langue.
- `npm run scaffold` audite la scène active vs `data/scenes.ts` (ids dupliqués/manquants/orphelins).
- Chargement à la demande + libération mémoire au changement de scène (`disposeObject3D()`), écran de chargement pendant le fetch.
- Repo Git poussé sur GitHub (`KMCODE-git/website`), déploiement continu vers Vercel actif sur `main` — voir le point de vigilance `office.glb` ci-dessus.
- Domaine `kmcode.fr` (+ `www`) connecté et DNS validé.

## Prochaines étapes possibles

1. **Régler l'hébergement de `office.glb`** (125 Mo, exclu du repo Git) : Git LFS (garde le fichier versionné avec le code, quota payant au-delà du palier gratuit GitHub) ou stockage externe type Vercel Blob (pas de limite de repo, mais charge l'URL à l'exécution plutôt qu'un chemin `public/` statique — demande d'adapter `objects/scenes/office.ts`). Décision à prendre avant que la scène fonctionne réellement en production.
2. Écrire le vrai contenu de chaque section dans `i18n/locales/fr.json`/`en.json` (`npm run scaffold:i18n` liste les clés encore en placeholder `"TODO"`), et les liens dans `data/scenes.ts`.
3. Ajouter d'autres scènes en suivant le pattern `objects/scenes/<id>.ts` + entrée dans `data/scenes.ts` — chaque nouvelle scène nécessite son propre calibrage caméra (voir `objects/CLAUDE.md`).
4. `lighting.ts` reste global (pas encore par scène) — à surveiller si une future scène demande une ambiance très différente (actuellement calé clair/scandinave).
5. Interactions "objet qui bouge" (ex. secouer une plante au clic) : l'état "interaction" post-zoom existe déjà (sortie uniquement via le bouton fermer, voir ci-dessus), reste à ajouter la Custom Property Blender discriminante (ex. `interaction: "shake"`) et l'animation elle-même (probablement `interactions/cameraRig.ts` ou un module frère), déclenchée après la fin du tween de zoom.
6. Intégrer `flag_en.glb`/`flag_fr.glb` à un vrai sélecteur de langue une fois `en.json` rempli.
