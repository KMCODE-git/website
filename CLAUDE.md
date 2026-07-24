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
index.html                    # point d'entrée : <canvas id="scene"> (page unique, pas de panneau de contenu)
src/main.ts                     # orchestration : init(), état d'interaction, boucle d'animation
src/scene.ts                     # THREE.Scene, background, fog
src/camera.ts                     # PerspectiveCamera + resize
src/renderer.ts                    # WebGLRenderer, tone mapping, shadow map, resize
src/lighting.ts                      # éclairage global 3 points (ambient/key/fill/rim)
src/postprocessing.ts                 # EffectComposer + bloom (zones émissives uniquement)
src/data/scenes.ts                     # SceneConfig : caméra par défaut/surcharges de focus (voir plus bas)
src/objects/loader.ts                    # loadModel(), collectInteractiveObjects()
src/objects/autoFocus.ts                  # focus caméra auto-calculé depuis la géométrie d'un objet
src/objects/resolveEntries.ts               # fusion Blender (auto) + surcharge data/scenes.ts, par objet
src/objects/scenes/office.ts                  # construction Three.js de la scène (voir src/objects/CLAUDE.md)
src/interactions/raycaster.ts                   # hover + click sur objets 3D (voir src/interactions/CLAUDE.md)
src/interactions/cameraRig.ts                     # tween caméra (repos <-> focus objet)
src/interactions/parallax.ts                        # décalage caméra opposé à la souris (remplace la navigation libre)
src/interactions/objectAnimations.ts                  # animations locales sur les objets (survol-lift, swing, spin, bounce...)
src/ui/accessibleNav.ts                                  # fallback clavier pour les objets interactifs
src/ui/loading.ts                                          # overlay de chargement pendant init()
src/style.css                                                # reset + styles nav clavier/loading
public/models/*.glb                                            # assets 3D (servis tels quels par Vite)
vite.config.ts
tsconfig.json
```

Des `CLAUDE.md` plus détaillés existent dans certains sous-dossiers (`objects/`, `interactions/`, `ui/`) pour les conventions spécifiques à chaque brique — à consulter/enrichir en travaillant dedans.

## Page unique

Le site est une seule page/scène 3D (`"office"`) — pas de navigation entre plusieurs scènes (une architecture multi-scènes avait été construite puis retirée : plus de barre flottante, plus de `loadScene(id)`/registre de builders). `main.ts` expose `init()`, appelé une fois au démarrage : charge le modèle, construit les objets interactifs, ne recharge/décharge jamais rien ensuite (pas de dispose en cours de session, la page entière se recharge si besoin).

**Rendre un objet interactif** ne se fait pas en code : poser des Custom Properties Blender sur l'objet (export glTF avec "Custom Properties" coché) — voir `src/objects/CLAUDE.md` pour le détail. `collectInteractiveObjects()` les récupère automatiquement au chargement.

## Interaction et caméra

Pivot important (l'ancien système à panneau de contenu + rond blanc de survol + navigation libre a été entièrement retiré) :

- **Plus de navigation caméra libre.** OrbitControls a été retiré du projet. La caméra reste sur la pose `defaultCamera` de la scène active ; le seul mouvement résiduel est un **léger décalage opposé au déplacement de la souris** (`interactions/parallax.ts`) — un effet de profondeur subtil, pas une vraie rotation/tilt pilotable. Suspendu pendant un zoom, désactivé entièrement si `prefers-reduced-motion`.
- **Plus de panneau de contenu ni de rond blanc de survol.** Au survol d'un objet interactif, un léger mouvement vers le haut signale qu'il est interactif — pas d'autre affordance visuelle. Cet effet et toutes les animations locales décrites ci-dessous vivent dans `interactions/objectAnimations.ts` (module unique, pour composer proprement plusieurs animations simultanées sur le même objet — ex. lift + shake — sans qu'elles s'écrasent en réécrivant `position`/`rotation` indépendamment).
- **Custom Properties Blender pour un objet interactif** (remplacent l'ancien trio `action`/`id`/`title`/`description`) — **pas de `id` à poser** :
  - `animation` (obligatoire, **Boolean**) — la seule condition pour qu'un objet devienne interactif : déclenche le survol (léger mouvement vers le haut, systématique, indépendant de tout le reste) et rend l'objet cliquable. `object.name` (déjà unique dans Blender) sert d'identifiant partout où il en faut un (focus caméra, surcharge `data/scenes.ts`) — rien à configurer en plus.
  - `animationTrigger` (String, `"hover"` ou `"click"`) — décide **quand** `animationType` se déclenche. N'affecte pas le survol-lift (toujours actif, voir ci-dessus) — s'y ajoute simplement quand `animationTrigger="hover"`. **Exception : `animationType="zoom"` reste déclenché uniquement au clic**, quelle que soit la valeur d'`animationTrigger` — mélanger zoom caméra et survol casserait la règle "sortie uniquement par clic ailleurs/Échap" (voir plus bas). Décision prise côté code faute de précision explicite, à corriger si ce n'est pas le comportement voulu.
  - `animationType` (String) — décide **quoi** se joue. Valeurs implémentées :
    - `"zoom"` — tween caméra vers un focus auto-calculé ou surchargé (voir `objects/CLAUDE.md`).
    - `"swing"` — oscillation rotation autour de l'axe vertical, amplitude en ease-out (forte dès le départ, s'atténue), pivot à la **base** de l'objet (pas son origine) pour que la base ne bouge pas pendant que le haut oscille.
    - `"swing_back"` — bascule vers l'arrière puis retour, un seul mouvement (pas d'oscillation répétée, contrairement à `swing`), pivot à la base également.
    - `"spin"` — tour complet (360°) autour de l'axe vertical, vitesse **linéaire** (pas d'easing), pivot à la base.
    - `"bounce"` — rebonds décroissants façon balle qui retombe (amplitude en ease-out), déplacement vertical uniquement.
    - `"move"` — déplacement (translation) dans une petite zone puis retour à la position initiale. **Pas de détection de collision réelle** — le rayon de déplacement est juste conservateur (proportionnel à la taille de l'objet) pour rester plausible sans contact, voir `interactions/objectAnimations.ts`.
    - `"swap"` — échange la position de deux **enfants directs** de l'objet interactif, tirés au hasard à chaque déclenchement (jamais systématiquement la même paire) — ne revient jamais au repos, contrairement aux valeurs ci-dessus : le but est de rebattre durablement l'ordre (ex. `Triptych`/`Triptych_1..3`). Écrit sur `position.z` (pas `.y`) : l'export glTF convertit le Z-up de Blender en Y-up, ce qui remappe l'axe Y de Blender sur Z côté Three.js — voir `objects/CLAUDE.md` pour le détail.
    - `"swap_light_color"` — fait avancer d'un cran une palette cyclique de couleurs (blanc chaud par défaut → rouge → vert → violet → rose → cyan) appliquée au `material.emissive` et à la `PointLight` associée de tous les descendants de l'objet interactif (ex. `Led_pannels`/`Led_pannel1..13`). Chaque teinte a son `emissiveIntensity` calibrée séparément (`calibratedLightColor()` dans `interactions/objectAnimations.ts`) pour donner la même luminance perçue que le blanc chaud par défaut — sans ça une même intensité numérique donne un rendu très inégal selon la teinte (le vert/cyan pèsent bien plus lourd que le bleu/violet dans la formule de luminance utilisée aussi par le seuil de bloom).
    - `"screen"` (cas particulier, voir `objects/CLAUDE.md`) — effet d'écran qui s'allume, posé sur un **sous-objet**, pas sur l'objet interactif racine. Contrairement aux autres valeurs ci-dessus : (1) ce n'est **pas** l'`animationType` du parent (le parent n'a besoin que d'`animationTrigger="hover"`, pas d'`animationType`) ; (2) **couplé directement au survol** (comme le survol-lift), pas déclenché au clic — s'allume tant que le parent est survolé, s'éteint aussitôt que le survol s'arrête (pas de timeline fixe à attendre).
    - Un objet `animation=true` avec un `animationType` absent ou non reconnu a son survol actif mais rien ne se déclenche en plus — en attente de futures valeurs.
- **Sortir d'un zoom** : pas de bouton fermer — un clic n'importe où, ou la touche Échap, ramène à la pose `defaultCamera` de la scène (`main.ts`, `closeActive()`).

## Commandes

```bash
npm install       # installer les dépendances
npm run dev       # serveur de dev Vite (hot reload)
npm run build     # tsc -b && vite build -> dist/
npm run preview   # preview du build de prod en local
npm run lint      # tsc --noEmit (vérif de types)
npm run scaffold  # avec `npm run dev` lancé ailleurs : audite data/scenes.ts vs la scène active (voir src/objects/CLAUDE.md)
```

## Conventions

- Scène découpée par responsabilité (`scene.ts`, `camera.ts`, `renderer.ts`, `objects/`, `interactions/`, `ui/`, `data/`) plutôt qu'un seul fichier monolithique. `main.ts` reste le seul point d'orchestration (câble les modules entre eux, ne contient pas de logique métier propre).
- Toujours gérer le `resize` de la fenêtre (aspect ratio caméra + `renderer.setSize` + `composer.setSize`).
- Pixel ratio capé à 2 (`Math.min(window.devicePixelRatio, 2)`) pour éviter de surcharger le rendu sur écrans Retina/HiDPI.
- Pas de dépendances UI framework (React, Vue...) sauf décision explicite de changer d'approche. Côté runtime/production, tout ce qui a été ajouté (GLTFLoader, DRACOLoader, EffectComposer/bloom) vient de `three/examples/jsm/*` — `dependencies` ne liste toujours que `three`. Seule exception : `playwright` en **devDependency** (utilisé par `scripts/scaffold-scenes.mjs`, jamais bundlé dans le site déployé) — à garder comme réflexe (dev vs runtime) avant d'ajouter un paquet.
- Assets 3D lourds (`.glb`) : servis depuis `public/models/`, chargés via `objects/loader.ts`.
- Focus caméra centralisé dans `data/scenes.ts` — ne pas coder de positions en dur ailleurs (voir `objects/resolveEntries.ts`/`objects/autoFocus.ts`).
- Accessibilité non négociable malgré le tout-canvas : fallback clavier (`ui/accessibleNav.ts`), respect de `prefers-reduced-motion` (`interactions/cameraRig.ts`, `parallax.ts`, `objectAnimations.ts`). Si un futur élément DOM est caché-mais-présent (comme l'ancien panneau de contenu), le neutraliser avec `inert`, pas juste `opacity`/`display`.

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

- Concept artistique : une seule page/scène 3D, `"office"` — un intérieur scandinave lumineux — bureau, chaise, plantes, cadres muraux, panneaux LED hexagonaux + néon assortis en éclairage chaud (`objects/scenes/office.ts`). L'architecture multi-scènes construite puis retirée (voir "Page unique" plus haut) : plus de barre flottante, plus de `loadScene(id)`.
- **Pivot d'interaction terminé et vérifié** : navigation caméra libre, panneau de contenu (titre/description/liens) et rond blanc de survol entièrement retirés, remplacés par le modèle décrit dans "Interaction et caméra" plus haut (parallaxe légère + hover-lift + animations locales au survol/clic). Vérifié en conditions réelles pour `zoom`/`swing`/`swing_back`/`spin`/`bounce`/`move`/`swap`/`swap_light_color`. L'ancien système i18n (`i18n/translate.ts`, `i18n/locales/*.json`) a été retiré avec le panneau.
- Un objet interactif n'a besoin **que** de la Custom Property `animation` (Boolean) — pas de `id` séparé : `object.name` (déjà unique dans Blender) sert d'identifiant partout (voir "Interaction et caméra"). `animationTrigger`/`animationType` décident quand/quoi.
- **`animationType="screen"` fonctionne et vérifié fiable** (`animationTrigger="hover"` posé sur `iPad`/`iPhone`/`Mac`/`Macbook_pro`) — reste `Apple_watch`, toujours sans `animationTrigger`. Couleur/intensité calibrées (`0x3a6ea5` à 2.5, voir `interactions/objectAnimations.ts`). Effet **couplé au survol** (continu, comme le lift), pas une timeline fixe — corrigé après un premier essai à durée fixe (on/hold/off) qui mettait trop de temps à s'éteindre. Un vrai bug de croisement a aussi été trouvé et corrigé : `Mac_screen`/`iPad_screen` (et séparément `iPhone_screen`/`Apple_watch_screen`) partageaient le **même matériau Blender** (mesh dupliqué sans "rendre le matériau unique") — survoler l'un allumait l'autre. Fix : le matériau est cloné au premier survol de chaque sous-objet (`getScreenGlow()`), donc chaque écran est désormais indépendant même si Blender ne l'est pas.
- `public/models/office.glb` recompressé sous 100 Mo (~55 Mo), Custom Properties confirmées présentes après export — n'a plus besoin de Git LFS ni de stockage externe, peut se committer normalement (reste exclu du repo pour l'instant, voir "Prochaines étapes"). Un `DRACOLoader` a été ajouté à `objects/loader.ts` (fichiers décodeur dans `public/draco/`, copiés depuis `three/examples/jsm/libs/draco/gltf/` — à resynchroniser si `three` est mis à jour) car ce modèle utilise (ou a utilisé) la compression géométrique Draco, qui plante silencieusement sans décodeur explicite.
- Éclairage global clair/neutre adapté à un style scandinave (`lighting.ts`), fond de scène assorti (`scene.ts`), accents chauds néon/LED gérés par la scène elle-même.
- Focus caméra de zoom : calculable automatiquement depuis la géométrie de l'objet (`objects/autoFocus.ts`) si l'entrée `data/scenes.ts` (clé = `object.name`) est omise — l'heuristique se trompe pour un objet très plat/large, très petit, ou situé loin de la zone habituelle. `data/scenes.ts` n'a actuellement aucune surcharge ; l'auto-focus a donné un bon résultat sur `Aquarium` sans calibrage, les autres objets `animationType="zoom"` restent à vérifier/calibrer au cas par cas.
- **`animationType="swap"`** (échange la position de deux enfants directs tirés au hasard, ex. `Triptych`/`Triptych_1..3`) implémenté et vérifié — écrit sur `position.z` (pas `.y` comme demandé initialement) : l'export glTF Z-up→Y-up remappe l'axe Y de Blender sur Z côté Three.js, confirmé sur `Triptych` (Y identique entre enfants, seul Z varie).
- **`animationType="swap_light_color"`** (ex-`swap_color`, `Led_pannels`/`Led_pannel1..13`) implémenté et vérifié — palette cyclique blanc chaud/rouge/vert/violet/rose/cyan, `emissiveIntensity` calibrée par teinte pour une luminance perçue constante (voir "Interaction et caméra" plus haut) — corrigé après un premier essai à intensité fixe où certaines couleurs semblaient beaucoup moins lumineuses que d'autres.
- Point de nettoyage mineur signalé côté Blender, non bloquant : `Plant_3_1` à `Plant_3_5` ont un `animation` de type Float (`"1.0"`) au lieu de Boolean ; `iPhone_screen003`/`Mac_screen` portent encore les anciennes Custom Properties `action`/`id`/`title`/`description` (ignorées par le code actuel).
- `npm run scaffold` audite le modèle chargé vs `data/scenes.ts` (noms dupliqués/manquants/orphelins, `animationType`/`animationTrigger` reconnus ou non).
- Repo Git poussé sur GitHub (`KMCODE-git/website`), déploiement continu vers Vercel actif sur `main`.
- Domaine `kmcode.fr` (+ `www`) connecté et DNS validé.

## Prochaines étapes possibles

1. **Poser `animationTrigger="hover"` sur `Apple_watch`** côté Blender — dernier objet à écran encore sans trigger (les 4 autres fonctionnent déjà).
2. Retirer l'exclusion `public/models/office.glb` du `.gitignore` et le committer (validé fonctionnel, sous la limite GitHub de 100 Mo).
3. Calibrer un focus manuel dans `data/scenes.ts` pour les objets `animationType="zoom"` dont l'auto-focus ne donne pas un bon résultat (vérifier `Mario_bross`/`Plant_3` par capture d'écran).
4. Nettoyer côté Blender : type de `animation` sur `Plant_3_1..5` (Float → Boolean), anciennes Custom Properties orphelines sur `iPhone_screen003`/`Mac_screen`.
