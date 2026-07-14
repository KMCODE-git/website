import * as THREE from "three";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const geometry = new THREE.IcosahedronGeometry(1.2, 0);
const material = new THREE.MeshStandardMaterial({ color: 0x5599ff, flatShading: true });
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

const ambient = new THREE.AmbientLight(0xffffff, 0.4);
const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(3, 3, 3);
scene.add(ambient, light);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  mesh.rotation.x += 0.003;
  mesh.rotation.y += 0.005;
  renderer.render(scene, camera);
}

animate();
