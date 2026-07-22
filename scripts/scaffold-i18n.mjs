// Parcourt la scène active du serveur de dev (même hook que scaffold-scenes.mjs,
// window.__kmcode_scaffold__ défini dans main.ts) et s'assure que chaque clé de traduction
// "title"/"description" posée dans Blender existe dans src/i18n/locales/fr.json et en.json —
// ajoute un placeholder pour les clés manquantes, ne touche jamais une clé déjà traduite.
//
// Usage : npm run dev (dans un autre terminal), puis npm run scaffold:i18n

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEV_SERVER_URL = process.env.KMCODE_DEV_URL ?? "http://localhost:5173";
const LOCALES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/i18n/locales");
const LOCALE_FILES = ["fr.json", "en.json"];
const PLACEHOLDER = "TODO";

function loadLocale(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : {};
}

function saveLocale(file, dict) {
  const sorted = Object.fromEntries(Object.keys(dict).sort().map((key) => [key, dict[key]]));
  writeFileSync(file, JSON.stringify(sorted, null, 2) + "\n");
}

async function main() {
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
    // Laisse le temps à loadScene()/resolveEntries() de tourner au moins une fois.
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

  const keys = new Set();
  for (const object of objects) {
    if (object.title) keys.add(object.title);
    if (object.description) keys.add(object.description);
  }

  if (keys.size === 0) {
    console.log("Aucune clé de traduction trouvée (aucun objet avec title/description Blender dans la scène active).");
    return;
  }

  console.log(`${keys.size} clé(s) de traduction trouvée(s) dans la scène active.\n`);

  for (const localeFile of LOCALE_FILES) {
    const file = path.join(LOCALES_DIR, localeFile);
    const dict = loadLocale(file);
    let added = 0;
    for (const key of keys) {
      if (!(key in dict)) {
        dict[key] = PLACEHOLDER;
        added++;
      }
    }
    saveLocale(file, dict);
    console.log(`${localeFile} : ${added} nouvelle(s) clé(s) ajoutée(s) (placeholder "${PLACEHOLDER}"), ${keys.size - added} déjà présente(s).`);
  }
}

main();
