import "./style.css";
import { AudioListener, Box3, Vector3, type AnimationClip, type Object3D } from "three";
import { createScene, createEnvironmentMap } from "./scene";
import { createCamera, handleCameraResize } from "./camera";
import { createRenderer, handleRendererResize } from "./renderer";
import { createLighting } from "./lighting";
import { createPostprocessing, handlePostprocessingResize } from "./postprocessing";
import { buildOfficeScene } from "./objects/scenes/office";
import { resolveEntries } from "./objects/resolveEntries";
import { createPointerPicker } from "./interactions/raycaster";
import { createCameraRig } from "./interactions/cameraRig";
import { createParallaxRig } from "./interactions/parallax";
import { createObjectAnimations } from "./interactions/objectAnimations";
import { prepareSceneEntrance, playSceneEntrance } from "./interactions/sceneEntrance";
import { createSoundEffects } from "./audio/soundEffects";
import { createAccessibleNav } from "./ui/accessibleNav";
import { createLoadingUi } from "./ui/loading";
import { createLinkOverlay } from "./ui/linkOverlay";
import { createSiteMenu } from "./ui/siteMenu";
import { createSoundToggle } from "./ui/soundToggle";
import { showMobileBlocker } from "./ui/mobileBlocker";
import { computeAutoFocus } from "./objects/autoFocus";
import { findClipForObject, configureKtx2Support } from "./objects/loader";
import { sceneConfig, type FocusEntry } from "./data/scenes";
import { linkTemplates } from "./data/links";
import { soundFiles, exclusiveSoundIds } from "./data/sounds";
import { isLowPowerDevice } from "./deviceCapabilities";

// Fraction de remplissage bien plus élevée que le zoom standard (0.75, voir autoFocus.ts) pour
// le gabarit "page" de link : effet recherché "on rentre dans l'objet", pas juste "on regarde
// l'objet de près". Reste au-dessus de camera.near (0.1, camera.ts) pour un objet de la taille
// de Mac — à revoir si un futur link="page" porte sur un objet beaucoup plus petit.
const LINK_PAGE_ZOOM_FILL_FRACTION = 3.5;

// Toute l'expérience 3D (chargement du modèle ~58 Mo, ombres, bloom, boucle de rendu) est
// réservée au desktop pour l'instant — voir CLAUDE.md racine, "Crash mobile" : les mitigations
// (pixel ratio réduit, ombres/bloom coupés) n'ont pas suffi à garantir la stabilité sur tous les
// appareils tactiles, retour à une page de blocage simple plutôt que de continuer à ajuster au
// cas par cas. `startApp()` n'est jamais appelée sur mobile — aucun `.glb` n'est chargé, aucun
// contexte WebGL créé.
if (isLowPowerDevice) {
  showMobileBlocker();
} else {
  startApp();
}

function startApp(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;

  const scene = createScene();
  const camera = createCamera();
  const renderer = createRenderer(canvas);
  configureKtx2Support(renderer);
  const environmentMap = createEnvironmentMap(renderer);
  const composer = createPostprocessing(renderer, scene, camera);
  const cameraRig = createCameraRig(camera);
  const parallaxRig = createParallaxRig(camera, canvas);
  const objectAnimations = createObjectAnimations();
  const loadingUi = createLoadingUi();
  // closeActive référencée avant sa déclaration textuelle plus bas : `function` est hoisté, donc
  // déjà disponible ici (l'appel ne se fait qu'au clic sur le bouton fermer, pas à la création).
  const linkOverlay = createLinkOverlay(() => closeActive());

  const { group: lightingGroup } = createLighting();
  scene.add(lightingGroup);

  // Sons ponctuels (voir audio/soundEffects.ts) : listener attaché à la caméra, nécessaire pour
  // que THREE.PositionalAudio calcule un volume/panning selon la distance à la caméra active.
  const soundListener = new AudioListener();
  camera.add(soundListener);
  const soundEffects = createSoundEffects(soundFiles, exclusiveSoundIds, soundListener);
  // Son activé par défaut — les politiques d'autoplay des navigateurs bloquent de toute façon
  // tout son tant qu'aucun geste utilisateur n'a eu lieu (voir unlockAudioContext() plus bas),
  // donc rien ne joue avant la première interaction quel que soit cet état initial. Pas besoin de
  // garder la référence retournée : rien d'autre dans main.ts n'a besoin de lire/fermer ce bouton
  // (contrairement à siteMenu, fermé aussi depuis le handler Échap plus bas).
  createSoundToggle(false, (muted) => soundEffects.setMuted(muted));

  // Débloque l'AudioContext partagé (politique d'autoplay des navigateurs : suspendu tant
  // qu'aucun geste utilisateur n'a eu lieu) dès le tout premier clic/touche, où qu'il ait lieu sur
  // la page — pas seulement sur un objet "sound", pour être prêt dès le premier son réellement
  // déclenché plus tard.
  function unlockAudioContext() {
    if (soundListener.context.state === "suspended") void soundListener.context.resume();
    window.removeEventListener("pointerdown", unlockAudioContext);
    window.removeEventListener("keydown", unlockAudioContext);
  }
  window.addEventListener("pointerdown", unlockAudioContext);
  window.addEventListener("keydown", unlockAudioContext);

  const defaultCameraPosition = new Vector3(...sceneConfig.defaultCamera.position);
  const defaultCameraTarget = new Vector3(...sceneConfig.defaultCamera.target);

  let activeId: string | null = null;
  let isAnimating = false;
  // Bloque tout hover/clic tant que l'animation d'arrivée (interactions/sceneEntrance.ts) tourne —
  // sans ça, survoler un objet encore en train de tomber déclenche le hover-lift
  // (objectAnimations.setHovered()), qui écrit sur le même object.position.y que le tween de chute
  // en cours : les deux se battent sur la même frame et l'objet reste visuellement bloqué au
  // contact de la souris au lieu de terminer sa chute (bug vécu). Repassé à false dans le
  // onComplete de playSceneEntrance() (voir init()).
  let sceneEntranceActive = true;
  let hoveredObject: Object3D | null = null;
  let currentEntries: Record<string, FocusEntry> = {};
  let currentObjectsById: Map<string, Object3D> = new Map();
  let currentAllInteractiveObjects: Object3D[] = [];
  // Retrouve l'objet 3D portant un `link` donné (ex. "projects" -> Mac) sans avoir à le fournir
  // explicitement — nécessaire pour activateLink() quand il est déclenché depuis le menu fixe
  // (siteMenu.ts) plutôt que par un clic direct sur l'objet (voir openLink()/activateLink()).
  let linkObjectsById: Map<string, Object3D> = new Map();

  // "animationClip" (ex. Aquarium : poissons/bulles) — couplé au cycle de vie du déclencheur
  // (peu importe lequel, voir CLAUDE.md racine) plutôt qu'un one-shot fire-and-forget : démarré à
  // l'entrée, arrêté à la sortie. setClipActive() est un no-op silencieux si l'objet n'a pas de
  // clip résolu, donc appelable sans vérifier animationClip/resolvedAnimationClip à chaque site.
  function setClipActiveIfAny(object: Object3D | null | undefined, active: boolean) {
    if (!object || object.userData.animationClip !== true) return;
    const clip = object.userData.resolvedAnimationClip as AnimationClip | undefined;
    if (clip) objectAnimations.setClipActive(object, clip, active);
  }

  // "sound" (Custom Property Blender, String, ex. "grass") — indépendante d'animationType, mais
  // sa lecture est pilotée par ce que rapporte objectAnimations.trigger() (voir TriggerOutcome) :
  // ne joue que si un cycle a réellement démarré cette fois (pas à chaque clic/survol si
  // l'animation était déjà en cours et donc bloquée — corrigé après un bug où enchaîner des clics
  // rejouait le son à chaque fois alors que l'animation, elle, ne se relançait pas).
  //
  // `loop` : un son couplé à une animation "loop" ou à un zoom doit lui-même boucler — sinon un
  // one-shot plus court que l'animation finit de jouer bien avant que l'utilisateur ne quitte
  // cet état, laissant l'animation continuer en silence (confusion vécue : ça ressemble à un
  // bug, l'utilisateur reclique en espérant relancer le son, ce qui arrête en fait toute la
  // boucle). L'arrêt réel (boucle ou zoom) ne se fait plus ici mais via
  // objectAnimations.onOneShotEnd() (voir plus bas) ou closeActive() pour le zoom — un seul
  // endroit par type d'état, jamais dupliqué au moment du déclenchement.
  function playSoundIfAny(object: Object3D | null | undefined, loop: boolean) {
    const soundId = object?.userData.sound as string | undefined;
    if (soundId) soundEffects.play(object!, soundId, loop);
  }

  function stopSoundIfAny(object: Object3D | null | undefined) {
    const soundId = object?.userData.sound as string | undefined;
    if (soundId) soundEffects.stop(object!, soundId);
  }

  // Coupe le son d'un objet exactement au moment où son cycle one-shot se termine POUR DE BON
  // (pas une simple relance de boucle) — couvre à la fois un one-shot classique qui durerait plus
  // longtemps que son animation (capé à cette durée) et un cycle "loop" arrêté (une fois son
  // dernier passage terminé, pas au moment du clic qui a demandé l'arrêt).
  objectAnimations.onOneShotEnd((object) => stopSoundIfAny(object));

  function setHovered(object: Object3D | null) {
    if (hoveredObject === object) return;
    const previouslyHovered = hoveredObject;
    hoveredObject = object;
    canvas.style.cursor = object ? "pointer" : "default";
    objectAnimations.setHovered(object);
    // Couplage survol pour "animationClip" quand animationTrigger="hover" — symétrique à "screen"
    // (toujours actif tant que survolé, pas de timeline fixe). Ignoré si animationTrigger="click"
    // (voir selectEntry()/closeActive() pour ce cas).
    if (previouslyHovered?.userData.animationTrigger === "hover") setClipActiveIfAny(previouslyHovered, false);
    if (object?.userData.animationTrigger === "hover") setClipActiveIfAny(object, true);
    // "zoom" reste déclenché uniquement au clic quel que soit animationTrigger (voir CLAUDE.md
    // racine, "Interaction et caméra") — le survol-lift ci-dessus reste actif dans tous les cas.
    if (object && object.userData.animationTrigger === "hover" && object.userData.animationType !== "zoom") {
      // "sound" ne démarre que si un cycle démarre réellement à l'entrée du survol (voir
      // TriggerOutcome) — l'arrêt (boucle ou capage) est géré ailleurs, voir onOneShotEnd().
      const outcome = objectAnimations.trigger(object, object.userData.animationType as string | undefined);
      if (outcome === "started") playSoundIfAny(object, object.userData.loop === true);
    }
  }

  function closeActive() {
    if (activeId === null || isAnimating) return;
    // Couplage clic pour "animationClip"/"sound" quand animationTrigger="click" — arrêtés "à la
    // sortie" (ici), démarrés dans selectEntry() (voir plus bas), même mécanique que le survol
    // ci-dessus. "sound" ici couvre le cas "zoom" (jamais géré par onOneShotEnd(), qui ne
    // connaît que les cycles one-shot d'objectAnimations.ts, pas le zoom).
    const activeObject = currentObjectsById.get(activeId);
    if (activeObject?.userData.animationTrigger === "click") {
      setClipActiveIfAny(activeObject, false);
      stopSoundIfAny(activeObject);
    }
    isAnimating = true;
    // Ferme d'abord l'overlay "page" éventuellement ouvert (voir openLink()) — avant que la
    // caméra ne commence à dézoomer, pour ne pas voir le contenu plein écran pendant le tween.
    // No-op si aucun overlay n'est ouvert (ex. simple animationType="zoom" sans link).
    linkOverlay.close();
    cameraRig.reset(sceneConfig.defaultCamera, () => {
      isAnimating = false;
      activeId = null;
      parallaxRig.setEnabled(true);
    });
  }

  // Ouvre le gabarit associé à un `link` (voir data/links.ts) — factorisé pour être appelable aussi
  // bien depuis un clic sur l'objet 3D qui porte ce `link` (openLink() ci-dessous) que depuis le
  // menu fixe (siteMenu.ts, selectMenuEntry() plus bas), qui ne connaît que la clé (ex.
  // "projects"), pas d'objet 3D. Renvoie true si le link a été traité (ou signalé manquant), pour
  // que les appelants sachent s'arrêter là.
  function activateLink(linkId: string, sourceObject: Object3D | null): boolean {
    const template = linkTemplates[linkId];
    if (!template) {
      console.warn(`link="${linkId}" mais aucun template n'existe pour cette valeur (voir data/links.ts).`);
      return true;
    }

    // "side"/"form" : pas de caméra impliquée, ouverture immédiate — seul "page" (ci-dessous) a
    // besoin d'un zoom préalable. "form" (contact) suit exactement la même règle que "side" ici :
    // seule sa géométrie/contenu diffère (voir ui/linkOverlay.ts), pas sa coordination avec
    // activeId/isAnimating.
    if (template.type === "side" || template.type === "form") {
      setHovered(null);
      linkOverlay.open(template);
      return true;
    }

    // "page" : besoin de l'objet portant ce link pour calculer le zoom (computeAutoFocus lit sa
    // bounding box) — fourni directement par l'appelant si on vient d'un clic sur l'objet 3D
    // lui-même, sinon retrouvé via linkObjectsById (déclenché depuis le menu fixe).
    const object = sourceObject ?? linkObjectsById.get(linkId) ?? null;
    if (!object) {
      console.warn(`link="${linkId}" est de type "page" mais aucun objet portant ce link n'a été trouvé dans la scène.`);
      return true;
    }

    // Zoom caméra max préalable dans l'objet — pas le cadrage standard (currentEntries, fillFraction
    // 0.75 utilisé par animationType="zoom") mais un cadrage dédié bien plus serré
    // (LINK_PAGE_ZOOM_FILL_FRACTION) pour l'effet "on rentre dedans". Même mécanique que
    // animationType="zoom" par ailleurs (activeId/isAnimating, pour que closeActive() sache
    // dézoomer) — la page ne s'affiche qu'une fois le zoom terminé (onComplete), en fondu (voir
    // .link-overlay--page dans style.css), pas simultanément au zoom.
    const focus = computeAutoFocus(object, camera.fov, defaultCameraPosition, LINK_PAGE_ZOOM_FILL_FRACTION);
    setHovered(null);
    activeId = object.name;
    isAnimating = true;
    parallaxRig.setEnabled(false);
    cameraRig.focus(focus, () => {
      isAnimating = false;
      linkOverlay.open(template);
    });
    return true;
  }

  // "link" (Custom Property Blender) rend un objet cliquable à lui seul, indépendamment de
  // "animation"/"animationTrigger" — un simple clic suffit toujours (voir CLAUDE.md racine).
  // Renvoie true si l'objet portait un link (traité ou signalé manquant/non géré), pour que
  // selectEntry() n'enchaîne pas ensuite sur la logique zoom/animationType habituelle.
  function openLink(object: Object3D): boolean {
    const linkId = object.userData.link as string | undefined;
    if (!linkId) return false;
    return activateLink(linkId, object);
  }

  // Déclenché par le menu fixe (siteMenu.ts) — mêmes gardes que selectEntry()/onClick du raycaster
  // (sceneEntranceActive/isAnimating/activeId), + linkOverlay déjà ouvert (le bouton du menu reste
  // techniquement joignable au clavier même recouvert visuellement par un gabarit "side"/"page" en
  // cours, voir style.css : .site-menu passe sous .link-overlay en z-index).
  function selectMenuEntry(linkId: string) {
    if (sceneEntranceActive || isAnimating || activeId !== null || linkOverlay.isOpen()) return;
    activateLink(linkId, null);
  }

  function selectEntry(id: string) {
    if (sceneEntranceActive || isAnimating || activeId !== null) return;
    const object = currentObjectsById.get(id);
    if (!object) return;

    if (openLink(object)) return;

    // Couplage clic pour "animationClip" quand animationTrigger="click" (ex. Aquarium, même clic
    // que le zoom ci-dessous) — démarré ici, arrêté dans closeActive() ("à la sortie" du zoom,
    // voir setClipActiveIfAny()/CLAUDE.md racine). Indépendant d'animationType (fonctionne que le
    // clic déclenche aussi un zoom ou non).
    if (object.userData.animationTrigger === "click") setClipActiveIfAny(object, true);

    if (object.userData.animationType === "zoom") {
      const entry = currentEntries[id];
      if (!entry) return;
      // "sound" joué directement ici pour un objet zoom+click (ex. Aquarium) : contrairement aux
      // autres animationType ci-dessous, pas besoin de passer par le résultat de
      // objectAnimations.trigger() (jamais appelé pour "zoom"). One-shot (`loop: false`), pas
      // couplé à la durée du zoom (retour explicite : plus de boucle pour les sons de zoom) —
      // `closeActive()` continue d'appeler stopSoundIfAny() à la sortie, sans effet si le son a
      // déjà fini de lui-même entre-temps (stop() est un no-op silencieux). Aucun risque de
      // rejouer en double : le chaînage de clics n'est de toute façon pas possible tant qu'on est
      // zoomé (activeId bloque un second selectEntry(), voir onClick dans init()).
      if (object.userData.animationTrigger === "click") playSoundIfAny(object, false);
      setHovered(null);
      activeId = id;
      isAnimating = true;
      parallaxRig.setEnabled(false);
      cameraRig.focus(entry.focus, () => {
        isAnimating = false;
      });
      return;
    }

    // Les autres animationType (swing/swing_back/spin/bounce/move/scale_interval) ne déclenchent
    // au clic que si animationTrigger="click" — sinon c'est le survol qui s'en charge, voir
    // setHovered() ci-dessus. "sound" ne démarre que si un cycle démarre réellement cette fois
    // (pas à chaque clic enchaîné pendant qu'un cycle tourne déjà et reste donc bloqué — bug
    // corrigé, voir CLAUDE.md racine) ; l'arrêt (boucle ou capage) est géré ailleurs, voir
    // onOneShotEnd() plus haut.
    if (object.userData.animationTrigger === "click") {
      const outcome = objectAnimations.trigger(object, object.userData.animationType as string | undefined);
      if (outcome === "started") playSoundIfAny(object, object.userData.loop === true);
    }
  }

  const accessibleNav = createAccessibleNav(selectEntry);

  // Menu fixe (coin haut-droite) — accès direct aux mêmes pages que les objets `link` de la scène
  // (voir data/links.ts), sans devoir chercher/cliquer l'objet correspondant en 3D. Labels/ordre
  // choisis côté code (pas de vrai contenu i18n branché encore, voir data/links.ts) : à ajuster une
  // fois le vrai contenu décidé.
  const siteMenu = createSiteMenu(
    [
      { id: "projects", label: "Projets" },
      { id: "hobbies", label: "Loisirs" },
      { id: "contact", label: "Contact" },
    ],
    selectMenuEntry
  );

  async function init(): Promise<void> {
    loadingUi.show();

    const { group, model, interactiveObjects: allInteractiveObjects, animations } = await buildOfficeScene(environmentMap);
    scene.add(group);
    currentAllInteractiveObjects = allInteractiveObjects;

    // Associe une fois pour toutes chaque objet "animationClip" à son AnimationClip glTF (voir
    // objects/loader.ts, findClipForObject()) — évite de refaire cette recherche à chaque clic.
    for (const object of allInteractiveObjects) {
      if (object.userData.animationClip !== true) continue;
      const clip = findClipForObject(animations, object);
      if (!clip) {
        console.warn(`"${object.name}" a animationClip=true mais aucun AnimationClip correspondant n'a été trouvé dans le glTF.`);
        continue;
      }
      object.userData.resolvedAnimationClip = clip;
    }

    // Précompile les shaders de tous les matériaux de la scène avant de révéler quoi que ce soit
    // (encore masqué par l'écran de chargement à ce stade).
    renderer.compile(scene, camera);

    parallaxRig.setBase(defaultCameraPosition, defaultCameraTarget);
    cameraRig.setCurrentTarget(defaultCameraTarget);

    // Un objet portant userData.animation===true (Custom Property Blender) fonctionne déjà sans
    // entrée dans data/scenes.ts : focus auto-calculé, identifié par son object.name. entries ne
    // sert qu'à surcharger ce résultat (voir objects/resolveEntries.ts). Doit impérativement
    // s'exécuter AVANT prepareSceneEntrance() ci-dessous : computeAutoFocus() lit la bounding box
    // courante de chaque objet, qui doit encore être sa position de repos, pas déjà déplacée vers
    // sa position "cachée" de l'animation d'arrivée (bug vécu : le focus de zoom visait la
    // position élevée d'avant-chute plutôt que la position finale de l'objet).
    const { entries, interactiveObjects } = resolveEntries(allInteractiveObjects, sceneConfig.entries, camera.fov, defaultCameraPosition);

    currentObjectsById = new Map(interactiveObjects.map((object) => [object.name, object]));
    // Reconstruit à chaque init() (page unique, appelé une seule fois — voir CLAUDE.md racine) :
    // permet à activateLink() de retrouver l'objet portant un `link` donné même quand il est
    // déclenché depuis le menu fixe (siteMenu.ts), qui ne connaît que la clé, pas l'objet 3D.
    linkObjectsById = new Map();
    for (const object of interactiveObjects) {
      const linkId = object.userData.link as string | undefined;
      if (linkId) linkObjectsById.set(linkId, object);
    }
    createPointerPicker(camera, canvas, interactiveObjects, {
      onHover(id) {
        if (sceneEntranceActive || activeId !== null || isAnimating) return;
        setHovered(id ? (currentObjectsById.get(id) ?? null) : null);
      },
      onClick(id) {
        if (sceneEntranceActive || isAnimating) return;
        if (activeId === null) {
          if (id) selectEntry(id);
        } else {
          closeActive();
        }
      },
    });

    currentEntries = entries;
    accessibleNav.setEntries(entries);

    // Rendu complet "à blanc" (encore masqué derrière l'écran de chargement), PENDANT que tous les
    // objets sont encore à leur position de repos normale (visible/dans le champ de la caméra) —
    // renderer.compile() ne fait que compiler les shaders (voir plus haut), pas initialiser les
    // framebuffers de shadow map/bloom NI uploader les textures des objets : Three.js n'uploade la
    // texture d'un objet que la première fois qu'il est réellement rendu (pas frustum-culled).
    // Volontairement AVANT prepareSceneEntrance() ci-dessous : si ce rendu avait lieu après avoir
    // déjà déplacé les objets hors-champ pour l'animation d'arrivée, chacun se retrouverait
    // frustum-culled pendant ce rendu et son upload de texture serait reporté au moment où il
    // entre réellement dans le champ pendant la chute — étalant ces uploads coûteux sur toute la
    // durée de l'animation au lieu de les regrouper ici, cachés derrière l'écran de chargement
    // (bug vécu et confirmé via trace WebGL : gl.texSubImage2D() se déclenchait au fil de la chute).
    composer.render();

    // Positionne déjà tout hors-champ (murs glissés, sol descendu, items élevés) ici, pendant que
    // l'écran de chargement masque encore tout — playSceneEntrance() plus bas ne fera plus que
    // démarrer l'horloge du tween, rien de plus, pile au moment de la révélation. Volontairement
    // après resolveEntries() ET composer.render() ci-dessus (voir leurs commentaires).
    const sceneEntrancePlan = prepareSceneEntrance(model);

    loadingUi.hide();
    // renderer.shadowMap.autoUpdate reste à false en permanence (renderer.ts) — y compris
    // pendant cette animation (~24 objets qui bougent simultanément), pour la même raison qu'en
    // régime normal ensuite (voir animate() plus bas) : un seul recalcul forcé une fois que tout
    // s'est stabilisé, pas un par frame pendant la chute.
    playSceneEntrance(sceneEntrancePlan, () => {
      renderer.shadowMap.needsUpdate = true;
      sceneEntranceActive = false;
    });
  }

  // Pont dev-only pour scripts/scaffold-scenes.mjs (voir objects/CLAUDE.md) : liste tous les
  // objets interactifs (userData.animation===true et/ou userData.link) — permet au script de
  // détecter les noms dupliqués et si le focus vient d'une surcharge ou de l'auto.
  if (import.meta.env.DEV) {
    interface ScaffoldObjectInfo {
      name: string;
      animationType: string | null;
      animationTrigger: string | null;
      link: string | null;
      center: [number, number, number];
      size: [number, number, number];
    }
    (window as unknown as { __kmcode_scaffold__: { listInteractiveObjects: () => ScaffoldObjectInfo[] } }).__kmcode_scaffold__ = {
      listInteractiveObjects: () =>
        currentAllInteractiveObjects.map((object) => {
          const box = new Box3().setFromObject(object);
          const center = box.getCenter(new Vector3());
          const size = box.getSize(new Vector3());
          return {
            name: object.name,
            animationType: (object.userData.animationType as string | undefined) ?? null,
            animationTrigger: (object.userData.animationTrigger as string | undefined) ?? null,
            link: (object.userData.link as string | undefined) ?? null,
            center: center.toArray() as [number, number, number],
            size: size.toArray() as [number, number, number],
          };
        }),
    };
  }

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeActive();
    linkOverlay.close();
    siteMenu.close();
  });

  window.addEventListener("resize", () => {
    handleCameraResize(camera);
    handleRendererResize(renderer);
    handlePostprocessingResize(composer);
  });

  function animate() {
    requestAnimationFrame(animate);
    parallaxRig.update();
    // renderer.shadowMap.autoUpdate = false en permanence (renderer.ts) — ne marquer la shadow
    // map "dirty" que les frames où de la géométrie a réellement bougé (objectAnimations.update()
    // renvoie ce constat, voir CLAUDE.md racine) évite de recalculer une shadow map 2048×2048 à
    // chaque frame alors que la scène est immobile la quasi-totalité du temps. `||=` plutôt qu'une
    // affectation directe : ne jamais écraser un `true` déjà posé ailleurs la même frame (ex. le
    // recalcul final forcé dans playSceneEntrance()'s onComplete, plus haut) — Three.js remet
    // lui-même needsUpdate à false une fois la shadow map effectivement recalculée, jamais nous.
    if (objectAnimations.update()) renderer.shadowMap.needsUpdate = true;
    composer.render();
  }

  animate();
  void init();
}
