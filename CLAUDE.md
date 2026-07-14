# KMCODE

Site personnel avec une expérience Three.js en plein écran, déployé sur Vercel derrière le domaine **kmcode.fr**.

## Objectif du projet

Le site EST l'expérience 3D : une scène Three.js interactive en plein écran (pas une simple landing page avec un hero 3D). Le contenu, la navigation et les interactions doivent être pensés à travers la scène 3D elle-même.

## Stack

- **Three.js** en vanilla TypeScript (pas de React Three Fiber)
- **Vite** comme bundler / dev server
- **TypeScript** strict
- Déploiement sur **Vercel**, domaine custom `kmcode.fr`

## Structure

```
index.html       # point d'entrée, contient le <canvas id="scene">
src/main.ts       # setup Three.js (scene, camera, renderer, boucle d'animation)
src/style.css     # reset minimal (canvas plein écran, pas de scroll/overflow)
vite.config.ts
tsconfig.json
```

## Commandes

```bash
npm install       # installer les dépendances
npm run dev       # serveur de dev Vite (hot reload)
npm run build     # tsc -b && vite build -> dist/
npm run preview   # preview du build de prod en local
npm run lint      # tsc --noEmit (vérif de types)
```

## Conventions

- Un seul point d'entrée `src/main.ts` pour l'instant. Si la scène grossit, découper par responsabilité (`scene.ts`, `camera.ts`, `objects/`, `controls.ts`) plutôt qu'en un seul fichier monolithique — mais ne pas anticiper cette découpe avant qu'elle soit nécessaire.
- Toujours gérer le `resize` de la fenêtre (aspect ratio caméra + `renderer.setSize`).
- Pixel ratio capé à 2 (`Math.min(window.devicePixelRatio, 2)`) pour éviter de surcharger le rendu sur écrans Retina/HiDPI.
- Pas de dépendances UI framework (React, Vue...) sauf décision explicite de changer d'approche.
- Assets 3D/textures lourds : les servir depuis `public/` et les charger de façon async (ne pas bloquer le premier rendu).

## Déploiement

- Repo Git : https://github.com/KMCODE-git/website.git
- Vercel détecte automatiquement le framework Vite (build command `npm run build`, output `dist`).
- Compte Vercel créé, projet lié au repo GitHub ci-dessus (déploiement continu déjà actif sur les pushs).
- Domaine `kmcode.fr` déjà possédé par l'utilisateur, reste à connecter dans les paramètres Domains du projet Vercel (DNS chez le registrar : soit nameservers Vercel, soit enregistrements A/CNAME fournis par Vercel).

## État actuel du projet

- Scaffold Vite + TypeScript + Three.js en place, `npm run build` passe.
- Scène de test fonctionnelle (icosaèdre qui tourne, éclairage ambiant + directionnel) — sert de validation technique, pas de contenu final.
- Repo Git créé et poussé sur GitHub (`KMCODE-git/website`).
- Projet Vercel créé et connecté au repo.
- Pas encore fait : connecter le domaine `kmcode.fr` au projet Vercel, définir le concept artistique réel de la scène 3D.

## Prochaines étapes possibles

1. Dans le dashboard Vercel du projet : **Settings → Domains → Add** `kmcode.fr` (et éventuellement `www.kmcode.fr`).
2. Configurer le DNS chez le registrar du domaine selon ce que Vercel indique (soit changer les nameservers vers Vercel, soit ajouter les enregistrements A/CNAME fournis).
3. Attendre la propagation DNS (peut prendre de quelques minutes à 24-48h) et vérifier le certificat SSL auto-généré par Vercel.
4. Définir l'intention artistique / narrative de la scène (que voit-on, comment on interagit).
5. Ajouter les contrôles d'interaction (souris/scroll/tactile) selon le concept choisi.
