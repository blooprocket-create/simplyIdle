/**
 * Generate hero portrait images using the Gemini API (Nano Banana 2).
 *
 * Usage:
 *   node scripts/generate-hero-portraits.mjs                          # generate all 65
 *   node scripts/generate-hero-portraits.mjs h1 h5 h12               # generate specific IDs
 *   node scripts/generate-hero-portraits.mjs --model gemini-2.5-flash-image h1  # override model
 *
 * Default model: gemini-3.1-flash-image-preview (Nano Banana 2)
 *
 * Requires: GEMINI_API_KEY environment variable
 * Output:   IMG/HeroIcon/<PascalName>.png (1024x1024, square, full-bleed)
 */

import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "IMG", "HeroIcon");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("ERROR: Set GEMINI_API_KEY environment variable first.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

// ── Full Hero Roster with Lore ──────────────────────────────────────────────

const HEROES = [
  // ── Tier 1 ──
  {
    id: "h1", name: "Kael Ironheart", heroClass: "warrior", tier: 1,
    backstory: "Held the breach at Blackgate for three days with a shattered shield and a single oath: no civilian falls while he still stands.",
    weapon: "Blackgate Oathwall", skillFlavor: "Turns a broken line into an unbreakable defense.",
  },
  {
    id: "h2", name: "Mira Oathguard", heroClass: "warrior", tier: 1,
    backstory: "Youngest captain ever sworn to the Crownfall Wall, secretly funded refugee caravans with her campaign stipends.",
    weapon: "Crownfall Convoy Shield", skillFlavor: "Marches protection forward with every rescued soul.",
  },
  {
    id: "h3", name: "Drogan Ashfury", heroClass: "berserker", tier: 1,
    backstory: "Exiled for refusing a staged duel, returned years later to save the same clan that cast him out.",
    weapon: "Exile's Redress", skillFlavor: "Punishes any clan that mistakes mercy for weakness.",
  },
  {
    id: "h4", name: "Thorn Bloodhide", heroClass: "berserker", tier: 1,
    backstory: "Stitched his own war mantle from the hides of siege beasts, now leads frontline charges in silence.",
    weapon: "Siegehide Mantleaxe", skillFlavor: "Drives forward behind the weight of hunted war beasts.",
  },
  {
    id: "h5", name: "Sylvi Windmark", heroClass: "archer", tier: 1,
    backstory: "Learned to read storm drafts by sleeping in watchtowers, can split a moving target at full gallop.",
    weapon: "Gale-Sleeper Longbow", skillFlavor: "Reads wind shear before the arrow ever leaves the string.",
  },
  {
    id: "h6", name: "Riven Hawkeye", heroClass: "archer", tier: 1,
    backstory: "Once served as a royal execution archer, now uses that precision against tyrants instead of prisoners.",
    weapon: "Tyrant's Last Verdict", skillFlavor: "Executes oppressors with the same precision once used on prisoners.",
  },
  {
    id: "h7", name: "Lunara Frostweave", heroClass: "mage", tier: 1,
    backstory: "Froze a collapsing bridge long enough for an entire battalion to cross and never speaks of the cost.",
    weapon: "Bridge of White Silence", skillFlavor: "Freezes catastrophe into a path for allies to cross.",
  },
  {
    id: "h8", name: "Aziel Embermind", heroClass: "mage", tier: 1,
    backstory: "Court pyromancer who burned his own rank sigil after refusing to torch a rebel district.",
    weapon: "Brandless Censer", skillFlavor: "Turns forbidden fire against the rulers who ordered it.",
  },
  {
    id: "h9", name: "Shen Dawnfist", heroClass: "monk", tier: 1,
    backstory: "Defended a monastery granary through a seven-day siege using only open-hand forms and improvised staves.",
    weapon: "Granary Wardstaff", skillFlavor: "Finds endurance in hunger, rubble, and bare hands.",
  },
  {
    id: "h10", name: "Iria Lotusveil", heroClass: "monk", tier: 1,
    backstory: "Preserved forbidden healing sutras by encoding them into prayer choreography taught only at dawn.",
    weapon: "Dawnscript Veils", skillFlavor: "Unfolds lost healing doctrine through sacred movement.",
  },
  {
    id: "h11", name: "Borin Stonewall", heroClass: "warrior", tier: 1,
    backstory: "Quarry-born veteran who names each suit of armor after the village it protects.",
    weapon: "Village-Name Plate", skillFlavor: "Carries every protected settlement into the next defense.",
  },
  {
    id: "h12", name: "Karra Rageborn", heroClass: "berserker", tier: 1,
    backstory: "Survived the Red Pit trials at sixteen and now channels that fury to break slaver battalions.",
    weapon: "Pitscar Reaver", skillFlavor: "Turns trial scars into momentum that cannot be chained.",
  },
  {
    id: "h13", name: "Nyx Whisperleaf", heroClass: "archer", tier: 1,
    backstory: "Ran courier routes through occupied forests, mapping every patrol path from memory.",
    weapon: "Occupier's Blind", skillFlavor: "Shoots along the hidden paths only a courier survivor remembers.",
  },
  {
    id: "h14", name: "Vex Starchant", heroClass: "mage", tier: 1,
    backstory: "Rebuilt a ruined observatory into a battlefield command post powered by prism relays.",
    weapon: "Prism Command Lattice", skillFlavor: "Converts star math into battlefield certainty.",
  },
  {
    id: "h15", name: "Tarin Sunstep", heroClass: "monk", tier: 1,
    backstory: "Turned a ceremonial dance discipline into a mobile combat doctrine used by temple guards.",
    weapon: "Sunstep Warfan", skillFlavor: "Refines ceremonial grace into a marching combat rhythm.",
  },
  {
    id: "h16", name: "Orin Bastionforge", heroClass: "warrior", tier: 1,
    backstory: "Smith-general who tempers armor in ashwater and tests every plate in live drills.",
    weapon: "Ashwater Testhammer", skillFlavor: "Hits with the certainty of steel proven under real fire.",
  },
  {
    id: "h17", name: "Selene Ironbanner", heroClass: "warrior", tier: 1,
    backstory: "Reclaimed three fallen standards in one night raid and became a symbol of stubborn resistance.",
    weapon: "Night-Raid Standard", skillFlavor: "Raises morale the instant a fallen line is reclaimed.",
  },
  {
    id: "h18", name: "Varric Doomhowl", heroClass: "berserker", tier: 1,
    backstory: "Raised in war camps, can identify enemy banners by horn cadence alone.",
    weapon: "Hornblood Cleaver", skillFlavor: "Breaks enemy tempo by hearing command patterns before they crest.",
  },
  {
    id: "h19", name: "Morga Chainstorm", heroClass: "berserker", tier: 1,
    backstory: "Broke her captor legions by turning their own chainfields into trap corridors.",
    weapon: "Chainfield Sever", skillFlavor: "Turns enemy restraint into a killing lane.",
  },
  {
    id: "h20", name: "Aela Windpierce", heroClass: "archer", tier: 1,
    backstory: "Trained with cliff rangers and specializes in anti-commander shots beyond normal sight lines.",
    weapon: "Cliffline Talonbow", skillFlavor: "Punishes commanders who believe distance is safety.",
  },
  {
    id: "h21", name: "Kestrel Moonshot", heroClass: "archer", tier: 1,
    backstory: "Marks targets by moon angle and once ended a naval siege with three impossible arrows.",
    weapon: "Lunar Trident Bow", skillFlavor: "Aligns impossible shots to the cold math of moonlight.",
  },
  {
    id: "h22", name: "Seris Riftborn", heroClass: "mage", tier: 1,
    backstory: "Survived a laboratory collapse that fused void scar tissue into her casting channels.",
    weapon: "Scarwell Focus", skillFlavor: "Makes void damage flow through wounds that never fully closed.",
  },
  {
    id: "h23", name: "Noctis Emberveil", heroClass: "mage", tier: 1,
    backstory: "Siege lanternkeeper who learned to weaponize beacon fire into precision spell bursts.",
    weapon: "Beaconrend Lantern", skillFlavor: "Condenses siege-signal fire into disciplined devastation.",
  },
  {
    id: "h24", name: "Korin Stillwater", heroClass: "monk", tier: 1,
    backstory: "Mediates feuds between rival houses by day and breaks their mercenary lines by night.",
    weapon: "Treatybreaker Hands", skillFlavor: "Delivers the judgment diplomacy could not secure.",
  },
  {
    id: "h25", name: "Maeve Stormpalm", heroClass: "monk", tier: 1,
    backstory: "Perfected thunder-breath kata after losing her hearing in a temple collapse.",
    weapon: "Thunderbreath Tonfa", skillFlavor: "Lets motion speak where hearing no longer can.",
  },
  {
    id: "h26", name: "Gideon Flamecrest", heroClass: "warrior", tier: 1,
    backstory: "Commanded the Ember Watch and abandoned nobility titles to stay with his rank-and-file unit.",
    weapon: "Emberwatch Greatblade", skillFlavor: "Burns brighter when held beside common soldiers.",
  },
  {
    id: "h27", name: "Rook Ashrender", heroClass: "berserker", tier: 1,
    backstory: "Dismantled an entire war machine convoy using salvaged powder and timed ambushes.",
    weapon: "Convoy-Breaker Rig", skillFlavor: "Turns scavenged ruin into perfect demolition timing.",
  },
  {
    id: "h28", name: "Lyra Starquill", heroClass: "archer", tier: 1,
    backstory: "Battlefield cartographer whose star charts double as long-range firing solutions.",
    weapon: "Starplot Recurve", skillFlavor: "Fires where the chart says the future will stand.",
  },
  {
    id: "h29", name: "Eldrin Palefire", heroClass: "mage", tier: 1,
    backstory: "Studied mortuary rites and now bends soul-lamps into defensive wards for civilians.",
    weapon: "Soul-Lamp Reliquary", skillFlavor: "Binds mourning rites into protection for the living.",
  },
  {
    id: "h30", name: "Jin Hollowreed", heroClass: "monk", tier: 1,
    backstory: "Trained in floodplains where every stance must adapt to unstable footing and shifting currents.",
    weapon: "Floodstep Reedstaff", skillFlavor: "Flows through unstable terrain without ever surrendering balance.",
  },
  // ── Tier 2 ──
  {
    id: "h31", name: "Thors Ironpeak", heroClass: "warrior", tier: 2,
    backstory: "Mine guard who organized worker militias when the barons hired private armies.",
    weapon: "Baron's End Pickblade", skillFlavor: "Turns labor tools into the start of revolt.",
  },
  {
    id: "h32", name: "Valkyra Shieldborn", heroClass: "warrior", tier: 2,
    backstory: "Forged pact shields for orphan cohorts and treats every squadmate as sworn kin.",
    weapon: "Kinshield Pactblade", skillFlavor: "Fights as though every ally were sworn family.",
  },
  {
    id: "h33", name: "Brutus Ironjaw", heroClass: "berserker", tier: 2,
    backstory: "Won pit titles across five provinces before defecting to fight for frontier settlements.",
    weapon: "Five-Province Jawmaul", skillFlavor: "Carries arena brutality into wars that finally matter.",
  },
  {
    id: "h34", name: "Magus Stonereave", heroClass: "berserker", tier: 2,
    backstory: "Channels seismic shock through gauntlets etched with quarry sigils of his ancestors.",
    weapon: "Quarrysigil Fists", skillFlavor: "Calls old stone-markings back as living shockwaves.",
  },
  {
    id: "h35", name: "Vesper Silverbow", heroClass: "archer", tier: 2,
    backstory: "Served in traveling caravans and became famous for shooting while mounted at full sprint.",
    weapon: "Caravan Halo Bow", skillFlavor: "Keeps perfect aim even at full mounted speed.",
  },
  {
    id: "h36", name: "Fenwick Swiftbrand", heroClass: "archer", tier: 2,
    backstory: "Pioneered relay skirmish tactics that rotate archers in waves to maintain constant pressure.",
    weapon: "Relaybrand Repeater", skillFlavor: "Maintains relentless ranged tempo through disciplined cycling.",
  },
  {
    id: "h37", name: "Thalia Duskborn", heroClass: "mage", tier: 2,
    backstory: "Studied eclipse rituals and turned them into stealth spell doctrine for night assaults.",
    weapon: "Eclipse Catechism", skillFlavor: "Turns ritual shadow into surgical spell cover.",
  },
  {
    id: "h38", name: "Corvus Nightwhisper", heroClass: "mage", tier: 2,
    backstory: "Intercepted imperial cipher traffic and rewrote battlefield orders before dawn.",
    weapon: "Dawnthief Corvid Seal", skillFlavor: "Steals the enemy's next command before it is spoken.",
  },
  {
    id: "h39", name: "Kalen Dawnbringer", heroClass: "monk", tier: 2,
    backstory: "Rebuilt a shattered monastery wall by hand and then defended it through winter offensives.",
    weapon: "Winterwall Sunstaff", skillFlavor: "Builds a defense and becomes its first guardian.",
  },
  {
    id: "h40", name: "Sera Veilwanderer", heroClass: "monk", tier: 2,
    backstory: "Crossed plague quarantines with medicine convoys and refused every order to withdraw.",
    weapon: "Quarantine Veilblades", skillFlavor: "Cuts a safe road where plague and fear say to turn back.",
  },
  // ── Tier 3 ──
  {
    id: "h41", name: "Karthus Soulforge", heroClass: "warrior", tier: 3,
    backstory: "Binds memory shards into his blade, carrying the resolve of every fallen comrade.",
    weapon: "Memory-Anvil Greatsword", skillFlavor: "Strikes with the will of comrades preserved inside the steel.",
  },
  {
    id: "h42", name: "Azura Dawnbearer", heroClass: "warrior", tier: 3,
    backstory: "Heir to a dissolved house, now fights to build a republic instead of a throne.",
    weapon: "Republic Dawn", skillFlavor: "Fights for a future that outlives noble bloodlines.",
  },
  {
    id: "h43", name: "Viktor Darkbane", heroClass: "berserker", tier: 3,
    backstory: "Hunted warlords across border ruins and leaves no fortress with its command intact.",
    weapon: "Ruinbreak Fangblade", skillFlavor: "Leaves command structures gutted and leaderless.",
  },
  {
    id: "h44", name: "Morgath Terrorforge", heroClass: "berserker", tier: 3,
    backstory: "Once led a fear cult militia before turning on its prophets and burning their sanctums.",
    weapon: "Sanctumrend Idol-Axe", skillFlavor: "Burns fear doctrine down and feeds on the collapse.",
  },
  {
    id: "h45", name: "Zara Voidarchress", heroClass: "archer", tier: 3,
    backstory: "Learned vacuum-shot archery on collapsed skybridges where one misstep means death.",
    weapon: "Vacuumstring Bow", skillFlavor: "Shoots through empty air where hesitation means death.",
  },
  {
    id: "h46", name: "Kastor Deathmark", heroClass: "archer", tier: 3,
    backstory: "Served as a bounty warden and now uses those dossiers to dismantle corrupt command chains.",
    weapon: "Warden's Red Ledger", skillFlavor: "Turns old hunting records into a chain of command-kills.",
  },
  {
    id: "h47", name: "Iris Veilbearer", heroClass: "mage", tier: 3,
    backstory: "Shields entire formations with layered prism veils tuned to enemy tempo.",
    weapon: "Prismheart Canopy", skillFlavor: "Layers protective light exactly against the enemy's rhythm.",
  },
  {
    id: "h48", name: "Arctus Frostking", heroClass: "mage", tier: 3,
    backstory: "Mastered cryo-siege doctrine and can halt armored advances with staged ice fractures.",
    weapon: "Cryo-Crown Scepter", skillFlavor: "Breaks an advance by teaching the ground to freeze and split.",
  },
  {
    id: "h49", name: "Sorena Lightfury", heroClass: "monk", tier: 3,
    backstory: "Combines solar breath forms with shock-step footwork to crack elite lines.",
    weapon: "Lightfury Shockstaff", skillFlavor: "Combines radiant breath and impact footwork into one opening.",
  },
  {
    id: "h50", name: "Orion Soulshaper", heroClass: "monk", tier: 3,
    backstory: "Guides broken veterans through recovery rites and returns them to battle stronger.",
    weapon: "Soulreturn Mantra", skillFlavor: "Pulls the broken back into the fight with renewed shape.",
  },
  // ── Tier 4 ──
  {
    id: "h51", name: "Aethermaw Unbounded", heroClass: "warrior", tier: 4,
    backstory: "Emerged from the Eclipse Front carrying relic scales and a doctrine built for extinction wars.",
    weapon: "Eclipse-Scale Halberd", skillFlavor: "Advances with the doctrine of wars meant to erase civilizations.",
  },
  {
    id: "h52", name: "Seraph the Infinite", heroClass: "warrior", tier: 4,
    backstory: "Abandoned celestial office to stand with mortal ranks against collapsing empires.",
    weapon: "Office of the Fallen Wing", skillFlavor: "Trades celestial stature for absolute commitment to mortal lines.",
  },
  {
    id: "h53", name: "Ragnar Hellborn", heroClass: "berserker", tier: 4,
    backstory: "Raised in abyssal arenas and now treats every warlord citadel as another ring to conquer.",
    weapon: "Abyss Ringbreaker", skillFlavor: "Treats every fortress as another circle to conquer.",
  },
  {
    id: "h54", name: "Vyxara Shadow Empress", heroClass: "berserker", tier: 4,
    backstory: "Ruled a covert syndicate before redirecting its network toward anti-tyrant operations.",
    weapon: "Shadowcourt Headsman", skillFlavor: "Redirects an empire of secrets into targeted regime collapse.",
  },
  {
    id: "h55", name: "Zephyr Starreacher", heroClass: "archer", tier: 4,
    backstory: "Commands high-altitude strike wings and is known for ending battles before first impact.",
    weapon: "First-Impact Railbow", skillFlavor: "Ends the battle before the enemy registers the opening exchange.",
  },
  {
    id: "h56", name: "Nyx Void Chosen", heroClass: "archer", tier: 4,
    backstory: "Infiltrated cult command circles for years and collapsed them from the inside in one night.",
    weapon: "Cultneedle Widowbow", skillFlavor: "Brings years of infiltration down in a single coordinated kill.",
  },
  {
    id: "h57", name: "Archaon Time Weaver", heroClass: "mage", tier: 4,
    backstory: "Maps probable futures in combat and chooses the branch where civilians survive.",
    weapon: "Branchkeeper Chronometer", skillFlavor: "Selects the future where the innocent remain standing.",
  },
  {
    id: "h58", name: "Pyritess Eternal Flame", heroClass: "mage", tier: 4,
    backstory: "Carries a furnace heart relic that turns battlefield panic into focused output.",
    weapon: "Furnaceheart Scepter", skillFlavor: "Refines battlefield terror into controlled annihilation.",
  },
  {
    id: "h59", name: "Luminion Stellarch", heroClass: "monk", tier: 4,
    backstory: "Rebuilt the Stellar Cloister and trains monk officers for multi-front command.",
    weapon: "Stellarch Wheelstaff", skillFlavor: "Turns disciplined enlightenment into multi-front battle control.",
  },
  {
    id: "h60", name: "Void Sovereign", heroClass: "monk", tier: 4,
    backstory: "Returned from the Rift March with a vow to seal every breach before another age is erased.",
    weapon: "Riftseal Sovereign Rings", skillFlavor: "Closes breaches with the force of a final imperial decree.",
  },
  // ── Tier 5 ──
  {
    id: "h61", name: "Titan Worldrender", heroClass: "warrior", tier: 5,
    backstory: "Forged in orbital siege furnaces, now shatters god-plate battalions at the spearhead.",
    weapon: "Orbital Furnace Pike", skillFlavor: "Breaks divine armor the way siege furnaces break ore.",
  },
  {
    id: "h62", name: "Leviathan Depths", heroClass: "berserker", tier: 5,
    backstory: "Rose from abyssal trenches to break fleet fortresses with tidal-impact assault doctrine.",
    weapon: "Trenchwake Guillotine", skillFlavor: "Hits like an abyssal surge rolling over fortress walls.",
  },
  {
    id: "h63", name: "Phoenix Eternal", heroClass: "archer", tier: 5,
    backstory: "Leads skyfire hunter cadres and has survived more confirmed downings than any living archer.",
    weapon: "Downfall Sunwing", skillFlavor: "Returns from certain death as an airborne execution order.",
  },
  {
    id: "h64", name: "Celestial Architect", heroClass: "mage", tier: 5,
    backstory: "Rewrites battle geometry in real time, turning impossible theaters into executable plans.",
    weapon: "Theaterframe Axiom", skillFlavor: "Rearranges the field until victory becomes structurally inevitable.",
  },
  {
    id: "h65", name: "Dharma Eternal Cycle", heroClass: "monk", tier: 5,
    backstory: "Guards the Last Wheel archive, preserving combat wisdom across rebirth eras.",
    weapon: "Last Wheel Naginata", skillFlavor: "Carries preserved wisdom from one rebirth age into the next.",
  },
];

// ── Class Visual Archetypes ─────────────────────────────────────────────────

const CLASS_VISUALS = {
  warrior:   "heavy plate armor, strong jawline, battle-worn shield or sword visible, sturdy imposing build, scars from frontline combat",
  berserker: "wild untamed hair, fur-lined leather armor with exposed muscle, feral intense eyes, dual axes or massive cleaver, tribal war paint or ritual scars",
  archer:    "sleek leather or ranger gear, quiver visible over shoulder, sharp focused predator eyes, lean athletic build, hooded or wind-swept hair",
  mage:      "flowing enchanted robes, glowing arcane energy swirling around hands, ornate staff or tome, ethereal mystical eyes, magical particles in the air",
  monk:      "wrapped cloth and martial garb, prayer beads or sashes, serene yet dangerous expression, balanced martial stance, spiritual energy radiating from hands or body",
};

// ── Tier Power Escalation ───────────────────────────────────────────────────

const TIER_VISUALS = {
  1: {
    label: "Common Adventurer",
    desc: "Practical worn gear, muted earthy color palette (browns, greys, dull greens), simple materials, no magical effects, a working soldier look",
    lighting: "natural overcast lighting, subtle warm tones",
  },
  2: {
    label: "Veteran Elite",
    desc: "Polished refined equipment with visible craftsmanship, richer color palette (deep reds, steel blues, burnished gold accents), faint ambient glow from well-maintained enchanted gear",
    lighting: "warm golden hour lighting, slight heroic rim light",
  },
  3: {
    label: "Legendary Champion",
    desc: "Ornate legendary-quality gear with intricate engravings, radiant aura visible around the character, glowing weapon or armor highlights, rich saturated jewel-tone colors (emerald, sapphire, ruby, amethyst), commanding powerful presence",
    lighting: "dramatic chiaroscuro lighting with strong rim light, magical ambient glow",
  },
  4: {
    label: "Godlike Being",
    desc: "Otherworldly divine gear with reality-warping elements, intense supernatural aura that distorts the space around them, glowing eyes, divine golden or cosmic energy accents, floating particles or energy tendrils, armor that seems alive or transcendent",
    lighting: "intense backlit divine glow, volumetric god rays, stark dramatic shadows",
  },
  5: {
    label: "Transcendent Entity",
    desc: "Beyond mortal form, cosmic celestial energy emanating from every surface, reality fracturing or bending around them, star-field or void textures woven into their being, ethereal translucent elements, overwhelming radiant power that makes them barely containable in the frame",
    lighting: "supernova-intensity backlighting, prismatic light scattering, cosmic void contrasts",
  },
};

// ── Consistent Style Anchor ─────────────────────────────────────────────────

const STYLE_ANCHOR = [
  "Square 1:1 aspect ratio image. Full-bleed artwork filling the entire canvas edge to edge. No circular framing, no borders, no vignettes.",
  "Dark fantasy digital painting. Head and upper torso portrait, character fills 80% of the frame.",
  "Painterly semi-realistic style with visible brushwork. NOT anime, NOT photorealistic, NOT cartoon, NOT 3D render.",
  "Rich saturated color with dark moody background that has depth and subtle environmental particles (embers, dust, magic sparks appropriate to the character).",
  "Strong readable silhouette optimized for mobile — must look clear and distinct when scaled down to a 64px thumbnail.",
  "Face clearly visible and centered in the upper third, expressive eyes that convey personality, strong value contrast between character and background.",
  "Absolutely no text, no letters, no numbers, no watermarks, no signatures, no UI elements anywhere in the image.",
].join(" ");

// ── Prompt Builder ──────────────────────────────────────────────────────────

function buildPrompt(hero) {
  const cls = CLASS_VISUALS[hero.heroClass];
  const tier = TIER_VISUALS[hero.tier];

  return [
    STYLE_ANCHOR,
    ``,
    `Character: "${hero.name}" — a ${hero.heroClass}, power tier: ${tier.label}.`,
    `Backstory: ${hero.backstory}`,
    `Signature weapon: ${hero.weapon}. ${hero.skillFlavor}`,
    ``,
    `Class archetype visuals: ${cls}.`,
    `Power level visuals: ${tier.desc}.`,
    `Lighting direction: ${tier.lighting}.`,
    ``,
    `The character's facial expression, posture, gear condition, and color palette must reflect their personal story and power tier.`,
    `This portrait must be instantly recognizable and distinct among 65 different heroes when viewed at small mobile icon size.`,
  ].join("\n");
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toFileName(name) {
  return name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── CLI Args ────────────────────────────────────────────────────────────────

let MODEL = "gemini-3.1-flash-image-preview";
const cliArgs = process.argv.slice(2);
const heroArgs = [];
for (let i = 0; i < cliArgs.length; i++) {
  if (cliArgs[i] === "--model" && cliArgs[i + 1]) {
    MODEL = cliArgs[++i];
  } else {
    heroArgs.push(cliArgs[i]);
  }
}

console.log(`Using model: ${MODEL}\n`);

const MAX_RETRIES = 3;

// ── Generator ───────────────────────────────────────────────────────────────

async function generatePortrait(hero) {
  const prompt = buildPrompt(hero);
  const fileName = toFileName(hero.name) + ".png";
  const outputPath = path.join(OUTPUT_DIR, fileName);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const tag = attempt > 1 ? ` (retry ${attempt}/${MAX_RETRIES})` : "";
    console.log(`[${hero.id}] Generating: ${hero.name} → ${fileName}${tag}`);

    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts;
      if (!parts) {
        console.error(`[${hero.id}] No response parts returned.`);
        return false;
      }

      const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
      if (!imagePart) {
        const text = parts.map((p) => p.text).filter(Boolean).join(" ");
        console.error(`[${hero.id}] No image in response. Text: ${text.slice(0, 120)}`);
        if (attempt < MAX_RETRIES) {
          await delay(5000);
          continue;
        }
        return false;
      }

      const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
      fs.writeFileSync(outputPath, imageBuffer);
      console.log(`[${hero.id}] ✓ Saved (${(imageBuffer.length / 1024).toFixed(0)} KB)`);
      return true;
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        const retryMatch = msg.match(/retry in ([\d.]+)s/);
        const waitSec = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) + 5 : 60;
        console.warn(`[${hero.id}] Rate limited. Waiting ${waitSec}s...`);
        await delay(waitSec * 1000);
        continue;
      }
      if (msg.includes("503") || msg.includes("UNAVAILABLE")) {
        console.warn(`[${hero.id}] Server busy. Waiting 20s...`);
        await delay(20000);
        continue;
      }
      console.error(`[${hero.id}] FAILED: ${msg.slice(0, 200)}`);
      return false;
    }
  }
  console.error(`[${hero.id}] FAILED after ${MAX_RETRIES} retries.`);
  return false;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let heroesToGenerate = HEROES;
  if (heroArgs.length > 0) {
    heroesToGenerate = HEROES.filter((h) => heroArgs.includes(h.id));
    if (heroesToGenerate.length === 0) {
      console.error(`No heroes matched IDs: ${heroArgs.join(", ")}`);
      console.error(`Valid IDs: h1 through h65`);
      process.exit(1);
    }
  }

  console.log(`Generating ${heroesToGenerate.length} hero portraits...`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  let success = 0;
  let failed = 0;
  const failures = [];

  for (const hero of heroesToGenerate) {
    const ok = await generatePortrait(hero);
    if (ok) {
      success++;
    } else {
      failed++;
      failures.push(hero.id);
    }
    // Rate limit: 15s between requests
    if (hero !== heroesToGenerate[heroesToGenerate.length - 1]) {
      await delay(15000);
    }
  }

  console.log(`\n── Done ──`);
  console.log(`Success: ${success}/${heroesToGenerate.length}`);
  if (failed > 0) {
    console.log(`Failed:  ${failures.join(", ")}`);
    console.log(`\nRetry: node scripts/generate-hero-portraits.mjs ${failures.join(" ")}`);
  }
}

main();
