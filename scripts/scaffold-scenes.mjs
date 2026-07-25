// Inspecte la page active du serveur de dev (via le hook window.__kmcode_scaffold__, voir
// main.ts) et compare avec src/data/scenes.ts. Un objet avec la Custom Property Blender
// "animation"=true fonctionne déjà sans rien déclarer ici (focus auto-calculé, identifié par
// son object.name — voir objects/resolveEntries.ts) — ce script signale surtout les noms
// dupliqués (ambigus, ignorés par l'app), les objets sans "animationType"/"animationTrigger"
// reconnu (rien ne se déclenche pour cet objet), et les surcharges de focus orphelines dans
// data/scenes.ts.
//
// Usage : npm run dev (dans un autre terminal), puis npm run scaffold

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEV_SERVER_URL = process.env.KMCODE_DEV_URL ?? "http://localhost:5173";
const SCENES_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/data/scenes.ts");

// Clés structurelles de SceneConfig/FocusOverride — tout le reste qui matche `<clé>: {` dans
// le fichier est traité comme une clé d'override d'entrée.
const STRUCTURAL_KEYS = new Set(["defaultCamera", "entries", "focus"]);

// "screen" n'en fait pas partie : ce n'est plus un animationType à poser sur l'objet
// interactif racine (voir objects/CLAUDE.md), seulement sur un sous-objet — un objet racine
// avec animationType="screen" serait donc à tort signalé "non reconnu" ci-dessous.
const KNOWN_ANIMATION_TYPES = new Set(["zoom", "swing", "swing_back", "spin", "bounce", "move", "swap", "swap_light_color"]);
const KNOWN_TRIGGERS = new Set(["hover", "click"]);
// Valeurs de "link" avec un template dans data/links.ts (voir aussi ui/linkOverlay.ts) — pas
// besoin d'animationType/animationTrigger pour ces objets, le clic est toujours actif.
const KNOWN_LINKS = new Set(["contact", "hobbies", "projects"]);

async function main() {
  const fileSource = readFileSync(SCENES_FILE, "utf-8");
  // Ignore les interfaces TS en tête de fichier (ex. `focus?: CameraFocus` dans FocusOverride)
  // — on ne veut scanner que les données réelles, après `export const sceneConfig`.
  const scenesSource = fileSource.slice(fileSource.indexOf("export const sceneConfig"));

  const browser = await chromium.launch();
  let objects;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    try {
      await page.goto(DEV_SERVER_URL, { waitUntil: "domcontentloaded", timeout: 10000 });
    } catch {
      console.error(`Impossible de joindre ${DEV_SERVER_URL} — lance "npm run dev" dans un autre terminal d'abord.`);
      process.exitCode = 1;
      return;
    }
    await page.waitForSelector(".loading:not(.loading--visible)", { timeout: 120000 }).catch(() => {});
    // Laisse le temps à init()/resolveEntries() de tourner au moins une fois.
    await page.waitForTimeout(1500);

    objects = await page.evaluate(() => window.__kmcode_scaffold__?.listInteractiveObjects() ?? null);

    if (objects === null) {
      console.error("window.__kmcode_scaffold__ introuvable — ce hook n'existe qu'en dev (import.meta.env.DEV).");
      process.exitCode = 1;
      return;
    }
  } finally {
    await browser.close();
  }

  if (objects.length === 0) {
    console.log("Aucun objet interactif (animation===true ou link) trouvé.");
    return;
  }

  const byName = new Map();
  for (const object of objects) {
    if (!byName.has(object.name)) byName.set(object.name, []);
    byName.get(object.name).push(object);
  }

  const overrideKeys = new Set(
    [...scenesSource.matchAll(/(\w[\w-]*)\s*:\s*\{/g)].map((m) => m[1]).filter((key) => !STRUCTURAL_KEYS.has(key))
  );

  console.log(`\n${objects.length} objet(s) interactif(s) trouvé(s)\n`);

  const suggestions = [];
  for (const [name, group] of byName) {
    if (group.length > 1) {
      console.log(`  ⚠️  "${name}" — DOUBLON, posé sur ${group.length} objets du même nom. Ignoré par l'app tant que chaque objet interactif n'a pas un nom unique dans Blender.`);
      continue;
    }

    const object = group[0];

    // "link" rend l'objet cliquable à lui seul (clic toujours actif) — pas besoin
    // d'animationType/animationTrigger, donc pas de sens à vérifier "focus"/trigger pour lui.
    if (object.link) {
      const linkKnown = KNOWN_LINKS.has(object.link);
      console.log(`  - ${name} — link "${object.link}"${linkKnown ? "" : " (non reconnu !)"}`);
      if (!linkKnown) {
        suggestions.push(`"${name}" : link "${object.link}" sans template dans data/links.ts — le clic n'ouvrira rien.`);
      }
      continue;
    }

    const hasOverride = overrideKeys.has(name);
    // "focus" ne concerne que animationType="zoom" (seul type qui bouge la caméra) — pour les
    // autres, ce qui compte est plutôt animationTrigger (quand ça se déclenche).
    const isZoom = object.animationType === "zoom";
    const focusSource = hasOverride ? "surchargé dans data/scenes.ts" : "focus auto-calculé (objects/autoFocus.ts)";
    const triggerKnown = object.animationTrigger && KNOWN_TRIGGERS.has(object.animationTrigger);
    const triggerInfo = isZoom ? "" : `, déclenché au "${object.animationTrigger ?? "(absent)"}"${triggerKnown ? "" : " (non reconnu !)"}`;

    if (object.animationType && KNOWN_ANIMATION_TYPES.has(object.animationType)) {
      console.log(`  - ${name} — animationType "${object.animationType}"${isZoom ? `, ${focusSource}` : triggerInfo}`);
      if (!isZoom && !triggerKnown) {
        suggestions.push(`"${name}" : animationType "${object.animationType}" reconnu mais animationTrigger "${object.animationTrigger ?? "(absent)"}" ne l'est pas ("hover" ou "click" attendu) — l'effet ne se déclenchera jamais.`);
      }
    } else {
      console.log(`  - ${name} — animationType "${object.animationType ?? "(absent)"}" non reconnu : le clic/survol ne fait encore rien pour cet objet${isZoom ? "" : triggerInfo}`);
      suggestions.push(
        `"${name}" : animationType "${object.animationType ?? "(absent)"}" non géré côté code — vérifier que c'est voulu (voir objects/CLAUDE.md).`
      );
    }
  }

  const modelNames = new Set(byName.keys());
  const orphaned = [...overrideKeys].filter((key) => !modelNames.has(key));
  if (orphaned.length > 0) {
    console.log(`\n  ℹ️  Surcharges dans data/scenes.ts sans objet correspondant dans le modèle actuel (objet renommé/retiré) : ${orphaned.join(", ")}`);
  }

  if (suggestions.length > 0) {
    console.log("\nÀ vérifier :\n");
    console.log(suggestions.map((s) => `  - ${s}`).join("\n"));
  }
}

main();
