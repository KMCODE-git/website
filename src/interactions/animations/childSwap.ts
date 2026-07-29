import * as THREE from "three";
import { easeInOutCubic } from "./easing";

const SWAP_DURATION_MS = 1000;

// "swap" échange la position de deux enfants ADJACENTS à chaque déclenchement, sur l'axe qui les
// distingue — contrairement aux one-shot de objectAnimations.ts, ne revient jamais au repos : le
// but est de rebattre durablement l'ordre, pas de jouer un mouvement temporaire (voir CLAUDE.md
// racine). Écrit sur position.z (pas .y) : l'export glTF convertit le Z-up de Blender en Y-up, ce
// qui remappe l'axe Y de Blender (l'axe le long duquel les enfants du Triptych sont espacés dans
// Blender) sur Z côté Three.js — confirmé ici, les enfants ont un Y identique et seul Z varie.
//
// Glissement en ligne droite (ease-in-out), pas d'effet supplémentaire (ni arc de contournement,
// ni rétrécissement/téléportation — les deux essayés puis retirés sur retour direct de
// l'utilisateur, voir CLAUDE.md racine) : les deux enfants échangés se croisent forcément à
// mi-trajet, ce qui est accepté tel quel. Ce qui n'est PAS accepté : avec 3+ enfants alignés
// (ex. Triptych_1/2/3), échanger les deux enfants aux EXTRÉMITÉS ferait glisser leur trajectoire
// tout droit à travers la position de l'enfant du MILIEU, immobile — un chevauchement à trois
// bien plus visible que le simple croisement entre les deux enfants échangés. D'où la paire
// choisie au hasard parmi les paires ADJACENTES seulement (voir trigger()) : son point de
// croisement est toujours un point vide entre les deux, jamais la position d'un troisième enfant.
interface ChildSwap {
  child: THREE.Object3D;
  fromZ: number;
  toZ: number;
  startTime: number;
}

export interface ChildSwapSystem {
  // Renvoie false (rien fait) si reducedMotion, moins de 2 enfants, ou un glissement déjà en
  // cours pour un enfant du groupe — l'appelant (objectAnimations.ts) traduit ça en "blocked".
  trigger: (object: THREE.Object3D) => boolean;
  // Renvoie si un enfant a bougé cette frame — utilisé par objectAnimations.ts pour ne marquer la
  // shadow map "dirty" que quand de la géométrie a réellement changé.
  update: () => boolean;
}

// Écrit directement sur les enfants de l'objet interactif (jamais sur l'objet lui-même, ni via
// ObjectState/active de objectAnimations.ts) : indépendant du cœur lift/one-shot, extrait ici
// sans rien partager avec lui au-delà de `reducedMotion`.
export function createChildSwapSystem(reducedMotion: boolean): ChildSwapSystem {
  // Clé = l'enfant lui-même (pas l'objet interactif parent).
  const childSwaps = new Map<THREE.Object3D, ChildSwap>();
  // Slot Z "logique" actuel de chaque enfant impliqué dans un "swap" — toujours une des valeurs
  // de repos d'origine du groupe, jamais une valeur visuelle interpolée (contrairement à
  // child.position.z, qui peut être une position intermédiaire pendant qu'un glissement est en
  // cours). Capturé une seule fois au premier appel (avant qu'aucun swap n'ait eu lieu, donc
  // child.position.z est encore sa vraie position de repos), puis suivi uniquement via cette map
  // par la suite — sert aussi à trier les enfants par ordre spatial pour déterminer l'adjacence.
  const swapSlot = new WeakMap<THREE.Object3D, number>();

  function getSwapSlot(child: THREE.Object3D): number {
    let slot = swapSlot.get(child);
    if (slot === undefined) {
      slot = child.position.z;
      swapSlot.set(child, slot);
    }
    return slot;
  }

  return {
    trigger(object) {
      if (reducedMotion) return false;
      const children = object.children;
      if (children.length < 2) return false;
      // Verrou anti-re-déclenchement, comme les one-shot de objectAnimations.ts (swing/spin/
      // bounce/move) : tant qu'un enfant de ce groupe est encore en plein glissement, un nouveau
      // clic est ignoré plutôt que de réassigner un enfant mi-parcours à une toute nouvelle
      // paire/destination. Sans ce garde-fou, des clics rapprochés produisaient deux symptômes en
      // apparence différents mais de même cause : un reclic sur la même paire pendant son
      // glissement la faisait repartir en sens inverse depuis sa position déjà bien avancée,
      // donnant l'impression d'un "petit mouvement qui s'arrête" (retour quasi immédiat vers le
      // point de départ) ; un reclic qui attrapait un enfant en cours de route pour l'envoyer vers
      // un tout autre enfant lui faisait retraverser une bonne partie de la rangée, recréant un
      // chevauchement avec un troisième enfant que la restriction aux paires adjacentes
      // (ci-dessous) ne suffit plus à éviter une fois plusieurs glissements enchaînés.
      if (children.some((child) => childSwaps.has(child))) return false;
      // Trié par slot logique (pas par ordre des enfants dans le tableau, qui ne reflète pas
      // forcément leur ordre spatial) pour que "adjacent" veuille dire spatialement voisin sur
      // cet axe — voir le commentaire sur ChildSwap plus haut pour pourquoi ça compte (éviter
      // qu'une paire choisie traverse la position d'un enfant du milieu non concerné).
      const sorted = [...children].sort((x, y) => getSwapSlot(x) - getSwapSlot(y));
      const i = Math.floor(Math.random() * (sorted.length - 1));
      const a = sorted[i];
      const b = sorted[i + 1];

      // Échange les slots LOGIQUES (toujours une des valeurs de repos d'origine du groupe),
      // jamais une valeur visuelle interpolée — avec 3+ enfants (ex. Triptych_1..3), utiliser la
      // position visuelle courante d'un enfant comme cible pour un autre pouvait produire une
      // valeur qui n'était la position de repos d'aucun enfant, faisant atterrir deux enfants sur
      // la même position (chevauchement) ou un enfant sur une position orpheline. Voir
      // interactions/CLAUDE.md pour le détail.
      const aSlot = getSwapSlot(a);
      const bSlot = getSwapSlot(b);
      swapSlot.set(a, bSlot);
      swapSlot.set(b, aSlot);

      // fromZ = position de repos actuelle : garanti exact grâce au verrou ci-dessus (plus aucun
      // enfant du groupe n'est mi-parcours au moment où ce code s'exécute).
      const startTime = performance.now();
      childSwaps.set(a, { child: a, fromZ: a.position.z, toZ: bSlot, startTime });
      childSwaps.set(b, { child: b, fromZ: b.position.z, toZ: aSlot, startTime });
      return true;
    },
    update() {
      if (childSwaps.size === 0) return false;
      for (const [child, swap] of childSwaps) {
        const u = Math.min((performance.now() - swap.startTime) / SWAP_DURATION_MS, 1);
        child.position.z = swap.fromZ + (swap.toZ - swap.fromZ) * easeInOutCubic(u);
        if (u >= 1) childSwaps.delete(child);
      }
      return true;
    },
  };
}
