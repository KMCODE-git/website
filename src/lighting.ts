import * as THREE from "three";

export interface Lighting {
  group: THREE.Group;
}

export function createLighting(): Lighting {
  const group = new THREE.Group();

  // Éclairage clair et neutre, adapté à un intérieur scandinave lumineux —
  // les accents chauds (néon, panneaux LED) restent gérés par leur propre scène.
  const ambient = new THREE.AmbientLight(0xf5f0e6, 1.5);

  const key = new THREE.DirectionalLight(0xfff2e0, 1.3);
  key.position.set(3, 4.5, 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 15;
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0005;

  const fill = new THREE.DirectionalLight(0x88aaff, 0.3);
  fill.position.set(-4, 2, -2);

  const rim = new THREE.DirectionalLight(0xffffff, 0.3);
  rim.position.set(-2, 3, -4);

  group.add(ambient, key, fill, rim);

  return { group };
}
