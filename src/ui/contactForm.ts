import { translate } from "../i18n/translate";

// Adresse de destination du mailto: — pas de backend/service tiers (Formspree, fonction Vercel...)
// pour l'instant, décision explicite ("mailto c'est ok") : reste un site 100% statique, cohérent
// avec le reste du projet (aucune dépendance runtime au-delà de three, voir CLAUDE.md racine).
const CONTACT_EMAIL = "contact@kmcode.fr";

interface FieldConfig {
  key: string; // clé i18n du libellé (i18n/translate.ts)
  name: string;
  type: "text" | "email" | "tel";
  required: boolean;
  autocomplete: string;
}

// Nom/Téléphone optionnels, Email/Demande requis (le minimum pour pouvoir répondre) — pas
// spécifié explicitement, choix fait côté code faute de précision.
const FIELDS: FieldConfig[] = [
  { key: "contact.name", name: "name", type: "text", required: false, autocomplete: "name" },
  { key: "contact.email", name: "email", type: "email", required: true, autocomplete: "email" },
  { key: "contact.phone", name: "phone", type: "tel", required: false, autocomplete: "tel" },
];

// Libellé bilingue "simultané" (voir i18n/translate.ts) : primaire (français) en gras, secondaire
// (anglais) en sous-titre — même motif visuel que la maquette de référence (voir CLAUDE.md
// racine, page "Contact").
function createLabel(key: string): HTMLSpanElement {
  const { primary, secondary } = translate(key);
  const label = document.createElement("span");
  label.className = "contact-form__label";
  const primaryEl = document.createElement("span");
  primaryEl.className = "contact-form__label-primary";
  primaryEl.textContent = primary;
  const secondaryEl = document.createElement("span");
  secondaryEl.className = "contact-form__label-secondary";
  secondaryEl.textContent = secondary;
  label.append(primaryEl, secondaryEl);
  return label;
}

function buildMailto(name: string, email: string, phone: string, message: string): string {
  const subject = `Contact depuis kmcode.fr${name ? ` — ${name}` : ""}`;
  const lines = [`Nom / Société : ${name || "—"}`, `Email : ${email}`, `Téléphone : ${phone || "—"}`, "", message];
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

// Formulaire de contact — soumission via mailto: (ouvre le client mail par défaut de
// l'utilisateur avec l'objet/corps prérempli), pas d'envoi réseau : reste un site 100% statique.
export function createContactForm(): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "contact-form";

  const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};

  for (const field of FIELDS) {
    const wrapper = document.createElement("label");
    wrapper.className = "contact-form__field";
    wrapper.append(createLabel(field.key));
    const input = document.createElement("input");
    input.type = field.type;
    input.name = field.name;
    input.required = field.required;
    input.setAttribute("autocomplete", field.autocomplete);
    input.className = "contact-form__input";
    wrapper.append(input);
    form.append(wrapper);
    inputs[field.name] = input;
  }

  const messageWrapper = document.createElement("label");
  messageWrapper.className = "contact-form__field";
  messageWrapper.append(createLabel("contact.message"));
  const textarea = document.createElement("textarea");
  textarea.name = "message";
  textarea.required = true;
  textarea.rows = 5;
  textarea.className = "contact-form__input contact-form__input--textarea";
  textarea.placeholder = translate("contact.message.placeholder").primary;
  messageWrapper.append(textarea);
  form.append(messageWrapper);
  inputs.message = textarea;

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "contact-form__submit";
  submit.append(createLabel("contact.send"));
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  arrow.setAttribute("viewBox", "0 0 24 24");
  arrow.setAttribute("class", "contact-form__submit-arrow");
  arrow.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M5 12h14m0 0-6-6m6 6-6 6");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  arrow.append(path);
  submit.append(arrow);
  form.append(submit);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = (inputs.name as HTMLInputElement).value.trim();
    const email = (inputs.email as HTMLInputElement).value.trim();
    const phone = (inputs.phone as HTMLInputElement).value.trim();
    const message = (inputs.message as HTMLTextAreaElement).value.trim();
    window.location.href = buildMailto(name, email, phone, message);
  });

  return form;
}
