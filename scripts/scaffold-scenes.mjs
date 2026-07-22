// Inspecte la scène active du serveur de dev (via le hook window.__kmcode_scaffold__,
// voir main.ts) et compare avec src/data/scenes.ts. Un objet avec un id Blender fonctionne
// déjà sans rien déclarer ici (title/description viennent exclusivement de Blender, via
// i18n/translate.ts — data/scenes.ts ne surcharge plus que focus/links) — ce script signale
// surtout les ids dupliqués (ambigus, ignorés par l'app), et repère les objets sans titre
// Blender (le panneau n'affichera aucun titre pour eux, voir ui/panel.ts).
//
// Usage : npm run dev (dans un autre terminal), puis npm run scaffold

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEV_SERVER_URL = process.env.KMCODE_DEV_URL ?? "http://localhost:5173";
const SCENES_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/data/scenes.ts");

// Clés structurelles de SceneMeta/PortfolioEntryOverride — tout le reste qui matche
// `<clé>: {` dans le fichier est traité comme une clé d'override d'entrée.
const STRUCTURAL_KEYS = new Set(["defaultCamera", "distance", "panBounds", "polarAngle", "azimuthAngle", "entries", "focus"]);

async function main() {
  const fileSource = readFileSync(SCENES_FILE, "utf-8");
  // Ignore les interfaces TS en tête de fichier (ex. `links: { label: string... }` dans
  // PortfolioEntry) — on ne veut scanner que les données réelles, après `export const scenes`.
  const scenesSource = fileSource.slice(fileSource.indexOf("export const scenes"));

  const browser = await chromium.launch();
  let objects;
  let sceneId;
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
    // Laisse le temps à loadScene()/resolveEntries() de tourner au moins une fois.
    await page.waitForTimeout(1500);

    objects = await page.evaluate(() => window.__kmcode_scaffold__?.listInteractiveObjects() ?? null);
    sceneId = await page.evaluate(() => window.__kmcode_scaffold__?.sceneId() ?? null);

    if (objects === null) {
      console.error("window.__kmcode_scaffold__ introuvable — ce hook n'existe qu'en dev (import.meta.env.DEV).");
      process.exitCode = 1;
      return;
    }
  } finally {
    await browser.close();
  }

  if (objects.length === 0) {
    console.log(`Aucun objet avec un id trouvé dans la scène "${sceneId}".`);
    return;
  }

  const byId = new Map();
  for (const object of objects) {
    if (!byId.has(object.id)) byId.set(object.id, []);
    byId.get(object.id).push(object);
  }

  const overrideKeys = new Set(
    [...scenesSource.matchAll(/(\w[\w-]*)\s*:\s*\{/g)].map((m) => m[1]).filter((key) => !STRUCTURAL_KEYS.has(key))
  );

  console.log(`\nScène active : "${sceneId}" — ${objects.length} objet(s) avec un id trouvé(s)\n`);

  const suggestions = [];
  for (const [id, group] of byId) {
    if (group.length > 1) {
      console.log(
        `  ⚠️  "${id}" — DOUBLON, posé sur ${group.length} objets (${group.map((o) => o.name).join(", ")}). Ignoré par l'app tant que chaque objet n'a pas un id unique dans Blender.`
      );
      continue;
    }

    const object = group[0];
    const hasOverride = overrideKeys.has(id);
    const hasBlenderTitle = Boolean(object.title);

    if (hasBlenderTitle) {
      console.log(`  - ${id} (${object.name}) — titre Blender : "${object.title}"${hasOverride ? " (+ surcharge focus/links dans data/scenes.ts)" : ""}`);
    } else {
      console.log(`  - ${id} (${object.name}) — pas de "title" Blender : le panneau n'affichera aucun titre pour cet objet (voir ui/panel.ts)`);
      suggestions.push(
        `Ajouter une Custom Property "title" (String, ex. "title.${id}") sur "${object.name}" dans Blender — data/scenes.ts ne peut pas fournir de titre, seul Blender le peut (voir objects/CLAUDE.md).`
      );
    }
  }

  const modelIds = new Set(byId.keys());
  const orphaned = [...overrideKeys].filter((id) => id !== sceneId && !modelIds.has(id));
  if (orphaned.length > 0) {
    console.log(`\n  ℹ️  Surcharges dans data/scenes.ts sans objet correspondant dans la scène actuelle (autre scène, ou objet renommé/retiré) : ${orphaned.join(", ")}`);
  }

  if (suggestions.length > 0) {
    console.log("\nObjets sans titre — à corriger côté Blender (pas dans data/scenes.ts) :\n");
    console.log(suggestions.map((s) => `  - ${s}`).join("\n"));
  }
}

main();
