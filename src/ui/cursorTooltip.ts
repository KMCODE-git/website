import { translate, onLanguageChange } from "../i18n/translate";

export interface CursorTooltip {
  // `objectName` = `object.name` (déjà unique dans Blender, voir CLAUDE.md racine) — la clé i18n
  // affichée est `cursor.<objectName>` (ex. "cursor.Mac"), résolue comme n'importe quelle autre
  // clé (`i18n/translate.ts` retombe sur la clé brute telle quelle si aucune traduction n'existe
  // encore, visible plutôt que masqué — même convention que les autres placeholders du site).
  show: (objectName: string) => void;
  hide: () => void;
}

// Décalage par rapport au curseur (px) — évite que la bulle se retrouve pile sous le curseur
// (masquerait le point exact visé, et le survol du texte lui-même n'a pas de sens ici puisque la
// bulle a pointer-events: none).
const OFFSET_X = 16;
const OFFSET_Y = 20;

// Petite bulle qui suit le curseur, affichée tant qu'un objet `animation=true` est survolé — signal
// textuel en complément du hover-lift (mouvement) déjà systématique sur ces objets, voir CLAUDE.md
// racine "Interaction et caméra". `main.ts` (setHovered()) pilote entièrement show()/hide(), ce
// module ne connaît ni le raycaster ni l'état de survol lui-même — juste la position du curseur
// (pointermove, suivie ici plutôt que relayée depuis raycaster.ts, qui reste agnostique de tout ce
// qui n'est pas la détection hover/clic elle-même).
export function createCursorTooltip(): CursorTooltip {
  const el = document.createElement("div");
  el.className = "cursor-tooltip";
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);

  let currentObjectName: string | null = null;

  function render() {
    if (currentObjectName) el.textContent = translate(`cursor.${currentObjectName}`);
  }
  onLanguageChange(render);

  window.addEventListener("pointermove", (event) => {
    el.style.left = `${event.clientX + OFFSET_X}px`;
    el.style.top = `${event.clientY + OFFSET_Y}px`;
  });

  return {
    show(objectName) {
      currentObjectName = objectName;
      render();
      el.classList.add("cursor-tooltip--visible");
    },
    hide() {
      currentObjectName = null;
      el.classList.remove("cursor-tooltip--visible");
    },
  };
}
