import * as THREE from "three";

export interface Lighting {
  group: THREE.Group;
}

export function createLighting(): Lighting {
  const group = new THREE.Group();

  // Éclairage clair et neutre, adapté à un intérieur scandinave lumineux —
  // les accents chauds (néon, panneaux LED) restent gérés par leur propre scène.
  const ambient = new THREE.AmbientLight(0xf5f0e6, 1.0);

  const key = new THREE.DirectionalLight(0xfff2e0, 0.95);
  // z augmenté / y réduit par rapport à (3, 4.5, 2.5) : rapproche l'angle d'incidence de la
  // direction de la caméra par défaut (defaultCamera, data/scenes.ts, ~(2.5, 2.35, 2.5)) pour un
  // éclairage plus "de face" et moins uniquement plongeant.
  key.position.set(2.5, 3.5, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 15;
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0005;

  // HemisphereLight plutôt qu'une DirectionalLight bleue pour ce fill (c'était le cas avant) :
  // une DirectionalLight colorée produit un reflet spéculaire net de la même couleur sur toute
  // surface un peu brillante (rencontré sur Low_table) — sans scene.environment définie, ce
  // reflet vient uniquement des lumières elles-mêmes. HemisphereLight ne contribue qu'à la
  // lumière diffuse indirecte dans le modèle d'éclairage de Three.js, jamais au spéculaire :
  // aucun reflet coloré possible, quelle que soit sa couleur. Le bleu vient du sol
  // (groundColor) plutôt que du ciel — lit comme un rebond froid depuis le sol (cohérent avec
  // l'intention initiale du fill) plutôt que de la lumière venant encore d'en haut comme `key`.
  const fill = new THREE.HemisphereLight(0xf5f0e6, 0x88aaff, 0.12);

  const rim = new THREE.DirectionalLight(0xffffff, 0.2);
  rim.position.set(-2, 3, -4);

  group.add(ambient, key, fill, rim);

  return { group };
}
