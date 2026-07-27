import * as THREE from "three";

export interface SoundEffects {
  // Joue le son associé à `soundId` (clé de data/sounds.ts), spatialisé depuis `object`. `loop`
  // décide si ça boucle indéfiniment (couplé à un état actif de durée indéterminée — animation
  // "loop" ou zoom, voir interactions/CLAUDE.md) ou joue une seule fois (one-shot classique).
  // Ne fait rien (avec un avertissement console) si `soundId` n'a pas de fichier associé.
  play: (object: THREE.Object3D, soundId: string, loop: boolean) => void;
  // Coupe le son en cours pour cet (objet, soundId) s'il tourne encore — no-op silencieux sinon
  // (jamais joué, ou déjà terminé de lui-même). Utilisé à la fois pour arrêter une boucle/un zoom
  // à la sortie, et pour "capper" un one-shot qui tournerait encore plus longtemps que
  // l'animation qui l'accompagne (voir interactions/CLAUDE.md, onOneShotEnd).
  stop: (object: THREE.Object3D, soundId: string) => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
}

// Sons ponctuels déclenchés depuis un objet 3D via THREE.PositionalAudio plutôt qu'un
// <audio>/Audio() global : cohérent avec le stack vanilla Three.js du projet, et chaque son
// "vient" spatialement de l'objet qui l'a déclenché (spatialisation automatique via
// THREE.AudioListener attaché à la caméra, voir main.ts).
export function createSoundEffects(
  soundFiles: Record<string, string>,
  exclusiveSoundIds: ReadonlySet<string>,
  listener: THREE.AudioListener
): SoundEffects {
  // Un THREE.PositionalAudio par (objet, soundId) — créé une fois puis réutilisé (comme les
  // matériaux clonés de "screen" ou les AnimationMixer de "animationClip" dans
  // interactions/objectAnimations.ts) : évite de recréer un nœud Web Audio à chaque
  // déclenchement. Le buffer décodé, lui, est mis en cache par URL (pas par objet) : plusieurs
  // objets qui partagent le même `soundId` ne retéléchargent/redécodent pas le même fichier.
  const audioBySource = new Map<THREE.Object3D, Map<string, THREE.PositionalAudio>>();
  const bufferCache = new Map<string, Promise<AudioBuffer>>();
  const loader = new THREE.AudioLoader();

  function loadBuffer(url: string): Promise<AudioBuffer> {
    let cached = bufferCache.get(url);
    if (!cached) {
      cached = loader.loadAsync(url);
      bufferCache.set(url, cached);
    }
    return cached;
  }

  function getOrCreateAudio(object: THREE.Object3D, soundId: string): THREE.PositionalAudio {
    let bySoundId = audioBySource.get(object);
    if (!bySoundId) {
      bySoundId = new Map();
      audioBySource.set(object, bySoundId);
    }
    let audio = bySoundId.get(soundId);
    if (!audio) {
      audio = new THREE.PositionalAudio(listener);
      object.add(audio);
      bySoundId.set(soundId, audio);
    }
    return audio;
  }

  // Volume d'origine de chaque son actuellement mis en sourdine pour laisser passer un son
  // "exclusif" (voir exclusiveSoundIds) — permet de le restaurer exactement une fois ce dernier
  // terminé, plutôt que de le couper (voir duckAllExcept()/restoreDucked() ci-dessous : la
  // lecture — et une éventuelle boucle en cours — n'est jamais interrompue, seulement inaudible
  // le temps du son exclusif).
  const duckedVolumes = new Map<THREE.PositionalAudio, number>();

  function duckAllExcept(exclude: THREE.PositionalAudio) {
    for (const bySoundId of audioBySource.values()) {
      for (const audio of bySoundId.values()) {
        if (audio !== exclude && audio.isPlaying && !duckedVolumes.has(audio)) {
          duckedVolumes.set(audio, audio.getVolume());
          audio.setVolume(0);
        }
      }
    }
  }

  function restoreDucked() {
    for (const [audio, volume] of duckedVolumes) audio.setVolume(volume);
    duckedVolumes.clear();
  }

  return {
    play(object, soundId, loop) {
      const url = soundFiles[soundId];
      if (!url) {
        console.warn(`sound="${soundId}" mais aucun fichier n'existe pour cette valeur (voir data/sounds.ts).`);
        return;
      }

      const audio = getOrCreateAudio(object, soundId);
      const isExclusive = exclusiveSoundIds.has(soundId);

      // Un son "exclusif" (ex. pokemon_theme sur Pokeball) n'a pas de sens mélangé à un autre
      // son déjà en cours (ex. le bip de Speaker en boucle) : on met le reste en sourdine plutôt
      // que de le couper (voir duckAllExcept()). Restauré soit dès que CE son se termine tout
      // seul (onEnded, ne se déclenche jamais s'il boucle — un son qui boucle ne "finit" jamais
      // tout seul, voir THREE.Audio), soit dès qu'il est coupé de l'extérieur via stop()
      // ci-dessous (toujours appelé à un moment donné pour tout son couplé à un cycle
      // one-shot/loop/zoom, voir interactions/CLAUDE.md) — les deux chemins se complètent, aucun
      // des deux n'est optionnel selon que `loop` vaille true ou false ici.
      if (isExclusive) {
        duckAllExcept(audio);
        audio.onEnded = () => {
          audio.isPlaying = false;
          restoreDucked();
        };
      }

      // Rejoue depuis le début à chaque déclenchement : stop() avant play() au cas où le son
      // précédent tourne encore — Web Audio refuse un second play() sur une source déjà en
      // lecture.
      if (audio.isPlaying) audio.stop();
      audio.setLoop(loop);

      if (audio.buffer) {
        audio.play();
        return;
      }
      loadBuffer(url)
        .then((buffer) => {
          audio.setBuffer(buffer);
          audio.setLoop(loop);
          audio.play();
        })
        .catch((error) => {
          console.warn(`Échec du chargement du son "${soundId}" (${url}) :`, error);
        });
    },
    stop(object, soundId) {
      const audio = audioBySource.get(object)?.get(soundId);
      if (audio?.isPlaying) {
        audio.stop();
        // `stop()` met `source.onended = null` en interne (Three.js Audio.stop()) : le hook posé
        // dans play() pour un son exclusif ne se déclenchera donc jamais ici — filet de sécurité
        // pour ne pas laisser tout le reste muet si cet arrêt externe (ex. sortie de zoom) arrive
        // avant la fin naturelle du son.
        if (exclusiveSoundIds.has(soundId)) restoreDucked();
      }
    },
    setMuted(muted) {
      listener.setMasterVolume(muted ? 0 : 1);
    },
    isMuted: () => listener.getMasterVolume() === 0,
  };
}
