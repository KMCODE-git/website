# website (kmcode.fr)

Expérience Three.js déployée sur Vercel derrière le domaine [kmcode.fr](https://kmcode.fr).

## Prérequis

- Node.js (avec npm)

## Installation

```bash
npm install
```

## Démarrer le projet (dev)

```bash
npm run dev
```

Lance le serveur de développement Vite avec hot reload, accessible sur **http://localhost:5173**.

## Arrêter le projet (dev)

- Si lancé dans un terminal au premier plan : `Ctrl + C` dans ce terminal.
- Si lancé en arrière-plan, retrouver puis tuer le process :

```bash
lsof -ti :5173 | xargs kill
```

## Build de production

```bash
npm run build     # compile TypeScript + build Vite -> dist/
npm run preview   # sert le build de dist/ en local pour vérifier avant déploiement
```

`npm run preview` démarre aussi un serveur local (par défaut sur http://localhost:4173) ; il s'arrête de la même façon (`Ctrl + C`, ou `lsof -ti :4173 | xargs kill`).

## Vérification des types

```bash
npm run lint      # tsc --noEmit
```

## Déploiement

Le déploiement est automatique : chaque push sur `main` déclenche un build et un déploiement sur Vercel, qui sert le site sur `kmcode.fr` / `www.kmcode.fr`.
