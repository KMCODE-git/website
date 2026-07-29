import * as THREE from "three";

export interface ClipPlaybackSystem {
  // "animationClip" (voir objects/CLAUDE.md) : démarre/arrête un AnimationClip glTF embarqué
  // (ex. Aquarium, poissons/bulles) raciné sur `object`, couplé au cycle de vie du déclencheur
  // (survol ou clic, peu importe lequel — voir main.ts) comme "screen" pour le survol : actif
  // tant que la condition (survolé, ou zoomé pour un déclenchement au clic) l'est, pas un
  // one-shot. Indépendant d'animationType/trigger() de objectAnimations.ts.
  setActive: (object: THREE.Object3D, clip: THREE.AnimationClip, active: boolean) => void;
  // Renvoie si un mixer non désactivé a effectivement bougé sa géométrie cette frame — pas juste
  // "y a-t-il un mixer", puisqu'un clip mis en pause (setActive(..., false)) est gardé en mémoire
  // sans plus rien animer.
  update: () => boolean;
}

// Anime des enfants d'un objet via un AnimationClip glTF embarqué (AnimationMixer/Action) —
// complètement indépendant du cœur ObjectState/active de objectAnimations.ts (qui n'anime que
// position/rotation/scale de l'objet interactif racine lui-même via des tweens codés à la main).
export function createClipPlaybackSystem(reducedMotion: boolean): ClipPlaybackSystem {
  // Un mixer+action par objet, créés au premier setActive() puis réutilisés ensuite (mis en pause
  // plutôt que détruits/recréés à chaque aller-retour, pour que la nage reprenne exactement où
  // elle en était plutôt que de recommencer à zéro à chaque survol/clic) — clé = l'objet racine
  // du mixer (pas ses enfants animés par les tracks du clip).
  interface ClipPlayback {
    mixer: THREE.AnimationMixer;
    action: THREE.AnimationAction;
  }
  const clipPlaybacks = new Map<THREE.Object3D, ClipPlayback>();
  let lastUpdateTime: number | null = null;

  return {
    setActive(object, clip, isActive) {
      // Mouvement pur sans état "figé" pertinent (contrairement à "screen", qui peut sauter
      // directement à une intensité fixe) — désactivé entièrement sous prefers-reduced-motion,
      // comme les one-shot de objectAnimations.ts (swing/spin/bounce/move/swap).
      if (reducedMotion) return;
      let playback = clipPlaybacks.get(object);
      if (!playback) {
        const mixer = new THREE.AnimationMixer(object);
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
        action.paused = true;
        playback = { mixer, action };
        clipPlaybacks.set(object, playback);
      }
      // Pause/reprend plutôt que stop()/reset() : la nage reprend exactement où elle en était à
      // la prochaine activation, au lieu de recommencer à zéro à chaque survol/clic.
      playback.action.paused = !isActive;
    },
    // Delta en secondes depuis le dernier appel (AnimationMixer.update() attend des secondes, pas
    // des millisecondes) — calculé ici plutôt qu'avec un THREE.Clock pour rester cohérent avec le
    // reste du projet (performance.now() partout, pas de dépendance Three.js supplémentaire).
    update() {
      if (clipPlaybacks.size === 0) return false;
      const now = performance.now();
      const delta = lastUpdateTime === null ? 0 : (now - lastUpdateTime) / 1000;
      lastUpdateTime = now;
      let anyPlaying = false;
      // Mixer mis à jour même si son action est en pause (coût négligeable pour un seul clip) —
      // plus simple que de ne mettre à jour que les actifs, et ne change rien au résultat.
      for (const { mixer, action } of clipPlaybacks.values()) {
        mixer.update(delta);
        if (!action.paused) anyPlaying = true;
      }
      return anyPlaying;
    },
  };
}
