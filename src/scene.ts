import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd9c7a3);
  scene.fog = new THREE.Fog(0xd9c7a3, 8, 20);
  return scene;
}

// Sans envMap, un matériau métallique (metalness=1, ex. Mirror_Glass — roughness=0, clearcoat)
// n'a rien à réfléchir : dans le modèle PBR de Three.js, le métal n'a pas de composante diffuse,
// il ne réfléchit que l'environnement, jamais la lumière directe comme une surface mate.
// RoomEnvironment (générique, pas la vraie géométrie de la pièce) donne un reflet plausible pour
// un coût nul en continu : généré une seule fois ici via PMREMGenerator, jamais recalculé par la
// suite (contrairement à un vrai Reflector, qui re-rendrait la scène chaque frame).
//
// Renvoie la texture SANS l'assigner à `scene.environment` — un premier essai l'avait fait, mais
// `scene.environment` s'applique globalement à TOUS les matériaux PBR de la scène (pas seulement
// au miroir) : chaque surface un peu mate/brillante récupère d'un coup de l'éclairage ambiant
// diffus de cet environnement générique, ce qui rendait toute la scène "trop intense" et lui
// donnait un aspect délavé/voilé (confondu avec un effet de fog) — retour direct de l'utilisateur.
// Fix : la texture est appliquée au cas par cas (`material.envMap`), voir objects/scenes/office.ts
// pour Mirror_Glass — le reste de la scène retrouve son rendu d'avant, inchangé.
export function createEnvironmentMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const texture = pmremGenerator.fromScene(roomEnvironment, 0.04).texture;
  roomEnvironment.dispose();
  pmremGenerator.dispose();
  return texture;
}
