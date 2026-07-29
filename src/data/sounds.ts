// Associe une valeur de Custom Property Blender "sound" (String, ex. "grass_rustling") à un
// fichier audio dans public/sounds/ — one-shot ou en boucle selon animationTrigger/`loop`, pas une
// propriété du fichier lui-même (voir CLAUDE.md racine, "Son sur les animations", et
// audio/soundEffects.ts).
//
// `satisfies` plutôt qu'une annotation `: Record<string, string>` : garde les clés/valeurs en
// types littéraux inférés (ex. `keyof typeof soundFiles` donne l'union exacte des ids valides,
// utilisable ailleurs pour de l'autocomplete/une vérification statique) tout en validant que la
// forme reste bien `Record<string, string>` — une annotation directe aurait élargi les valeurs en
// `string` générique et perdu cette inférence.
export const soundFiles = {
  grass_rustling: "/sounds/grass_rustling.mp3",
  light_switch: "/sounds/light_switch.mp3",
  chair_rolling: "/sounds/chair_rolling.mp3",
  ambiance_sound: "/sounds/ambiance_sound.mp3",
  ps5: "/sounds/ps5.mp3",
  coffee: "/sounds/coffee.mp3",
  electric_noise: "/sounds/electric_noise.mp3",
} satisfies Record<string, string>;

// Sons "exclusifs" : quand l'un d'eux démarre, tous les autres sons en cours (peu importe
// l'objet qui les a déclenchés) sont mis en sourdine — pas coupés — le temps qu'il joue, puis
// remis à leur volume d'origine dès qu'il se termine tout seul (voir audio/soundEffects.ts,
// duckAllExcept()/restoreDucked()) : une boucle en cours (ex. "ambiance_sound" lui-même, posé en
// `loop=true` sur AirpodsMax) n'est jamais interrompue, juste inaudible un moment — pas besoin de
// recliquer dessus après coup. Un son "normal" (absent d'ici) ne coupe/ne mute jamais rien d'autre.
export const exclusiveSoundIds = new Set<string>(["ambiance_sound"]);
