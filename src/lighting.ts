import * as THREE from "three";

export interface Lighting {
  group: THREE.Group;
  // Exposée séparément (pas seulement dans `group`) pour que main.ts puisse l'assombrir quand la
  // lampe (Custom Property `animationType="lamp_toggle"`, interactions/objectAnimations.ts)
  // s'allume — ce module-ci ne connaît pas lighting.ts, la coordination se fait dans main.ts.
  diffuse: THREE.HemisphereLight;
}

// Éclairage simplifié à deux sources pour le nouveau modèle (office_lite.glb, setup de bureau
// compact) : une lumière principale depuis le dessus qui porte les ombres, plus une lumière
// diffuse d'appoint sans ombre — remplace l'ancien montage à 5 lumières (ambient/key/fill/rim/
// frontRight) pensé pour l'ancienne pièce complète (voir git log pour l'historique).
export function createLighting(): Lighting {
  const group = new THREE.Group();

  // Lumière du dessus (façon plafonnier/fenêtre de toit) — seule source à porter les ombres.
  // Blanc neutre (pas le blanc chaud de l'ancien modèle) + ombre adoucie (shadow.radius) pour se
  // rapprocher du rendu de la maquette de référence (helpers/, non versionné) : ombres visibles
  // mais aux bords doux, pas de contact dur. Cadrage de la shadow camera resserré autour du
  // bureau (setup compact, quelques unités de large) plutôt que la pièce entière d'avant.
  const top = new THREE.DirectionalLight(0xf5f7fa, 1.1);
  // z relevé (1 -> 2.5) : purement vertical, les faces tournées vers la caméra (dos de chaise,
  // face avant du bureau) ne recevaient quasiment aucune lumière directe (produit scalaire
  // normale/direction proche de 0), ne comptant que sur la diffuse — trop faible, elles
  // paraissaient "super sombres". Un léger angle vers l'avant les éclaire directement aussi,
  // sans perdre le caractère "du dessus" (l'ombre reste presque sous les objets, juste
  // légèrement décalée).
  top.position.set(-3, 6, 6);
  top.castShadow = true;
  top.shadow.mapSize.set(2048, 2048);
  top.shadow.camera.near = 1;
  top.shadow.camera.far = 12;
  top.shadow.camera.left = -3;
  top.shadow.camera.right = 3;
  top.shadow.camera.top = 3;
  top.shadow.camera.bottom = -3;
  top.shadow.bias = -0.0005;
  top.shadow.radius = 6;

  // Lumière diffuse d'appoint, jamais castShadow — HemisphereLight plutôt qu'une DirectionalLight
  // colorée : une DirectionalLight colorée produit un reflet spéculaire net de sa couleur sur
  // toute surface un peu brillante (déjà rencontré sur l'ancien modèle, voir CLAUDE.md racine),
  // une HemisphereLight ne contribue jamais au spéculaire dans Three.js, quelle que soit sa
  // couleur — safe même si Mac/PS5/AirpodsMax ont des surfaces glossy. Teintes neutres/froides
  // (plus de blanc chaud façon "scandinave") pour matcher la maquette de référence. Intensité
  // relevée (0.6 -> 1.4) : trop faible pour rattraper les faces à peine touchées par `top`
  // (voir ci-dessus), certains éléments restaient très sombres.
  const diffuse = new THREE.HemisphereLight(0xdce3ea, 0xb9c2cc, 2);

  group.add(top, diffuse);

  return { group, diffuse };
}
