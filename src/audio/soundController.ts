import { AudioListener, type Object3D, type Camera } from "three";
import { createSoundEffects } from "./soundEffects";
import { createSoundToggle, type SoundToggle } from "../ui/soundToggle";
import { soundFiles, exclusiveSoundIds } from "../data/sounds";

export interface SoundController {
  // "sound" (Custom Property Blender, String, ex. "grass_rustling") — indépendante
  // d'animationType, mais sa lecture est pilotée par l'appelant (main.ts) selon ce que rapporte
  // objectAnimations.trigger() (voir TriggerOutcome) : ne doit jouer que si un cycle a réellement
  // démarré cette fois, pas à chaque clic/survol si l'animation était déjà en cours.
  playSoundIfAny: (object: Object3D | null | undefined, loop: boolean) => void;
  stopSoundIfAny: (object: Object3D | null | undefined) => void;
  // Exposé pour que main.ts puisse basculer ce bouton en mode "retour" pendant le gabarit link
  // "page" (voir ui/soundToggle.ts, CLAUDE.md racine "Page Projets") — soundController reste par
  // ailleurs le seul endroit qui construit le bouton, main.ts ne fait que piloter son mode.
  soundToggle: SoundToggle;
}

// Regroupe tout le câblage sonore de démarrage : AudioListener attaché à la caméra (nécessaire
// pour que THREE.PositionalAudio calcule un volume/panning selon la distance à la caméra active),
// chargement des sons (data/sounds.ts), bouton mute (ui/soundToggle.ts), déblocage de
// l'AudioContext au premier geste utilisateur (politique d'autoplay des navigateurs). Exposé
// comme deux wrappers (playSoundIfAny/stopSoundIfAny) plutôt que soundEffects lui-même : le reste
// de l'app ne lit jamais userData.sound directement ailleurs, ce sont les deux seuls points
// d'entrée nécessaires.
export function createSoundController(camera: Camera): SoundController {
  const soundListener = new AudioListener();
  camera.add(soundListener);
  const soundEffects = createSoundEffects(soundFiles, exclusiveSoundIds, soundListener);

  // Son activé par défaut — les politiques d'autoplay des navigateurs bloquent de toute façon
  // tout son tant qu'aucun geste utilisateur n'a eu lieu (voir unlockAudioContext ci-dessous),
  // donc rien ne joue avant la première interaction quel que soit cet état initial.
  const soundToggle = createSoundToggle(false, (muted) => soundEffects.setMuted(muted));

  // Débloque l'AudioContext partagé (suspendu tant qu'aucun geste utilisateur n'a eu lieu) dès le
  // tout premier clic/touche, où qu'il ait lieu sur la page — pas seulement sur un objet "sound",
  // pour être prêt dès le premier son réellement déclenché plus tard.
  function unlockAudioContext() {
    if (soundListener.context.state === "suspended") void soundListener.context.resume();
    window.removeEventListener("pointerdown", unlockAudioContext);
    window.removeEventListener("keydown", unlockAudioContext);
  }
  window.addEventListener("pointerdown", unlockAudioContext);
  window.addEventListener("keydown", unlockAudioContext);

  return {
    playSoundIfAny(object, loop) {
      const soundId = object?.userData.sound as string | undefined;
      if (soundId) soundEffects.play(object!, soundId, loop);
    },
    stopSoundIfAny(object) {
      const soundId = object?.userData.sound as string | undefined;
      if (soundId) soundEffects.stop(object!, soundId);
    },
    soundToggle,
  };
}
