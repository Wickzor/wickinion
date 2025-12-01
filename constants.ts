import { CardDef, CardType, BoardSetup } from './types';

// Helper to generate consistent fantasy art URLs
const getArt = (prompt: string, seed: number) => 
  `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=400&height=300&seed=${seed}&nologo=true&model=flux`;

// --- BASIC CARDS (Always present) ---
export const BASIC_CARDS: Record<string, CardDef> = {
  copper: { 
    id: 'copper', name: 'Copper', cost: 0, type: CardType.TREASURE, value: 1, description: '+1 Coin',
    image: getArt('pile of rustic copper coins on wooden table, fantasy concept art, realistic, cinematic lighting', 101)
  },
  silver: { 
    id: 'silver', name: 'Silver', cost: 3, type: CardType.TREASURE, value: 2, description: '+2 Coins',
    image: getArt('stack of shiny silver coins and chalice, fantasy concept art, magical glint', 102)
  },
  gold: { 
    id: 'gold', name: 'Gold', cost: 6, type: CardType.TREASURE, value: 3, description: '+3 Coins',
    image: getArt('treasure chest overflowing with gold coins and gems, fantasy concept art, epic lighting', 103)
  },
  estate: { 
    id: 'estate', name: "Tim's Studio Flat", cost: 2, type: CardType.VICTORY, points: 1, description: '1 VP',
    image: getArt('humble medieval cottage with green fields and blue sky, oil painting style', 201)
  },
  duchy: { 
    id: 'duchy', name: "Julian's Summer House", cost: 5, type: CardType.VICTORY, points: 3, description: '3 VP',
    image: getArt('medieval stone manor house with sprawling gardens and trees, fantasy landscape', 202)
  },
  province: { 
    id: 'province', name: "Rune's Empire", cost: 8, type: CardType.VICTORY, points: 6, description: '6 VP',
    image: getArt('majestic royal white castle on a hill, kingdom view, epic fantasy landscape', 203)
  },
  curse: {
    id: 'curse', name: "Niklas Egg Fart", cost: 0, type: CardType.CURSE, points: -1, description: '-1 VP',
    image: getArt('dark purple cursed amulet emitting black smoke, scary, dark fantasy', 204)
  }
};

// --- KINGDOM CARDS (The 26 Selectable Cards) ---
export const KINGDOM_CARDS: Record<string, CardDef> = {
  artisan: {
    id: 'artisan', name: "Mattis 3D Printer", cost: 6, type: CardType.ACTION,
    description: 'Gain a card costing up to 5 to your hand. Put a card from hand onto deck.',
    image: getArt('medieval artisan sculpting stone statue in workshop, detailed', 301)
  },
  bandit: {
    id: 'bandit', name: "Björn the Mugger", cost: 5, type: CardType.ACTION,
    gold: 1, description: 'Gain a Gold. Attack: Opponents trash Silver/Gold from top 2 cards.',
    image: getArt('masked bandit rogue in a dark forest holding a dagger, dynamic lighting', 302)
  },
  bureaucrat: {
    id: 'bureaucrat', name: "Fredrik's Middle Management", cost: 4, type: CardType.ACTION,
    description: 'Gain Silver on deck. Attack: Opponents put Victory card from hand on deck.',
    image: getArt('medieval scribe writing on scroll in a library, candle light', 303)
  },
  cellar: {
    id: 'cellar', name: "Charlie's Man Cave", cost: 2, type: CardType.ACTION,
    actions: 1, description: '+1 Action. Discard any number of cards, then draw that many.',
    image: getArt('dark wine cellar with barrels and cobwebs, torchlight', 304)
  },
  chapel: {
    id: 'chapel', name: "Ivan's Bonfire", cost: 2, type: CardType.ACTION,
    description: 'Trash up to 4 cards from your hand.',
    image: getArt('small stone chapel with stained glass windows, peaceful sunlight', 305)
  },
  council_room: {
    id: 'council_room', name: "Andreas Group Chat", cost: 5, type: CardType.ACTION,
    cards: 4, buys: 1, description: '+4 Cards, +1 Buy. Each other player draws 1 card.',
    image: getArt('medieval council meeting round table with kings advisors', 306)
  },
  festival: {
    id: 'festival', name: "Tim's Rave", cost: 5, type: CardType.ACTION,
    actions: 2, buys: 1, gold: 2, description: '+2 Actions, +1 Buy, +2 Coins.',
    image: getArt('medieval street festival with colorful ribbons and music', 307)
  },
  gardens: {
    id: 'gardens', name: "Niklas Jungle", cost: 4, type: CardType.VICTORY,
    description: 'Worth 1 VP per 10 cards you have (round down).',
    image: getArt('elaborate royal gardens with hedge mazes and fountains', 308)
  },
  harbinger: {
    id: 'harbinger', name: "Rune's Déjà Vu", cost: 3, type: CardType.ACTION,
    cards: 1, actions: 1, description: '+1 Card, +1 Action. Put a card from discard onto deck.',
    image: getArt('mystical messenger rider galloping on horse, sunset', 309)
  },
  laboratory: {
    id: 'laboratory', name: "Julian's Energy Drink", cost: 5, type: CardType.ACTION,
    cards: 2, actions: 1, description: '+2 Cards, +1 Action.',
    image: getArt('alchemist laboratory with bubbling potions and glassware', 310)
  },
  library: {
    id: 'library', name: "Fredrik's Collection", cost: 5, type: CardType.ACTION,
    description: 'Draw until you have 7 cards in hand, skipping Action cards of your choice.',
    image: getArt('grand ancient library with towering bookshelves', 311)
  },
  market: {
    id: 'market', name: "Björn's Garage Sale", cost: 5, type: CardType.ACTION,
    cards: 1, actions: 1, buys: 1, gold: 1, description: '+1 Card, +1 Action, +1 Buy, +1 Coin.',
    image: getArt('bustling medieval marketplace stalls', 312)
  },
  merchant: {
    id: 'merchant', name: "Charlie's Used Cars", cost: 3, type: CardType.ACTION,
    cards: 1, actions: 1, description: '+1 Card, +1 Action. The first time you play Silver this turn, +1 Coin.',
    image: getArt('wealthy medieval merchant examining a gem', 313)
  },
  militia: {
    id: 'militia', name: "Ivan's Goon Squad", cost: 4, type: CardType.ACTION,
    gold: 2, description: '+2 Coins. Attack: Each other player discards down to 3 cards.',
    image: getArt('group of medieval town guards with spears and shields', 314)
  },
  mine: {
    id: 'mine', name: "Mattis Crypto Rig", cost: 5, type: CardType.ACTION,
    description: 'Trash a Treasure from hand. Gain a Treasure to hand costing up to 3 more.',
    image: getArt('dark mine shaft with pickaxe and gold vein', 315)
  },
  moat: {
    id: 'moat', name: "Niklas Firewall", cost: 2, type: CardType.REACTION,
    cards: 2, description: '+2 Cards. Reaction: Reveal to block an Attack.',
    image: getArt('castle moat with water and drawbridge raised', 316)
  },
  moneylender: {
    id: 'moneylender', name: "Rune's Pawn Shop", cost: 4, type: CardType.ACTION,
    description: 'You may trash a Copper from hand for +3 Coins.',
    image: getArt('shrewd moneylender counting coins at a desk', 317)
  },
  poacher: {
    id: 'poacher', name: "Andreas Leftovers", cost: 4, type: CardType.ACTION,
    cards: 1, actions: 1, gold: 1, description: '+1 Card, +1 Action, +1 Coin. Discard 1 card per empty Supply pile.',
    image: getArt('sneaky poacher in the woods with a bow', 318)
  },
  remodel: {
    id: 'remodel', name: "Tim's Makeover", cost: 4, type: CardType.ACTION,
    description: 'Trash a card from hand. Gain a card costing up to 2 more.',
    image: getArt('carpenters renovating a medieval house structure', 319)
  },
  sentry: {
    id: 'sentry', name: "Björn's Surveillance", cost: 5, type: CardType.ACTION,
    cards: 1, actions: 1, description: '+1 Card, +1 Action. Look at top 2 of deck: Trash and/or discard any.',
    image: getArt('watchtower sentry guard looking over the horizon', 320)
  },
  smithy: {
    id: 'smithy', name: "Mattis Forge", cost: 4, type: CardType.ACTION,
    cards: 3, description: '+3 Cards.',
    image: getArt('blacksmith hammering glowing iron on anvil', 321)
  },
  throne_room: {
    id: 'throne_room', name: "Julian's Gaming Chair", cost: 4, type: CardType.ACTION,
    description: 'You may play an Action card from your hand twice.',
    image: getArt('empty royal throne room with red carpet', 322)
  },
  vassal: {
    id: 'vassal', name: "Fredrik's Intern", cost: 3, type: CardType.ACTION,
    gold: 2, description: '+2 Coins. Discard top of deck. If Action, you may play it.',
    image: getArt('medieval vassal kneeling before a lord', 323)
  },
  village: {
    id: 'village', name: "Ivan's Block Party", cost: 3, type: CardType.ACTION,
    cards: 1, actions: 2, description: '+1 Card, +2 Actions.',
    image: getArt('peaceful small medieval village cottages', 324)
  },
  witch: {
    id: 'witch', name: "Charlie's Voodoo Doll", cost: 5, type: CardType.ACTION,
    cards: 2, description: '+2 Cards. Attack: Each other player gains a Curse.',
    image: getArt('wicked witch brewing potion in a cauldron, dark magic', 325)
  },
  workshop: {
    id: 'workshop', name: "Niklas IKEA Hack", cost: 3, type: CardType.ACTION,
    description: 'Gain a card costing up to 4.',
    image: getArt('busy workshop with tools and unfinished wood', 326)
  }
};

export const CARDS = { ...BASIC_CARDS, ...KINGDOM_CARDS };

// --- BOARD SETUPS ---

export const BOARD_SETUPS: BoardSetup[] = [
  {
    id: 'first_game',
    name: 'First Game',
    description: 'A balanced introduction to the realm. Focuses on straightforward expansion and resource management.',
    difficulty: 'Easy',
    cards: ['cellar', 'market', 'merchant', 'militia', 'mine', 'moat', 'remodel', 'smithy', 'village', 'workshop']
  },
  {
    id: 'size_distortion',
    name: 'Size Distortion',
    description: 'A contest of bloat and trim. While some seek to expand their domains rapidly, others find power in efficiency.',
    difficulty: 'Hard',
    cards: ['artisan', 'bandit', 'bureaucrat', 'chapel', 'festival', 'gardens', 'sentry', 'throne_room', 'village', 'witch']
  },
  {
    id: 'the_engine',
    name: 'The Engine',
    description: 'A setup that rewards momentum. Opportunities abound for those who can chain their decrees into a single, massive edict.',
    difficulty: 'Medium',
    cards: ['festival', 'laboratory', 'library', 'market', 'poacher', 'smithy', 'throne_room', 'village', 'council_room', 'harbinger']
  },
  {
    id: 'gold_treasures',
    name: 'Gold & Treasures',
    description: 'A heavy economy scenario. The markets are overflowing with wealth, but thieves lurk in the shadows.',
    difficulty: 'Easy',
    cards: ['bandit', 'bureaucrat', 'moneylender', 'mine', 'vassal', 'merchant', 'harbinger', 'artisan', 'market', 'poacher']
  },
  {
    id: 'chaos_reactions',
    name: 'Chaos & Reactions',
    description: 'A volatile battlefield where attacks are frequent and defense is paramount. Expect the unexpected.',
    difficulty: 'Hard',
    cards: ['cellar', 'council_room', 'festival', 'militia', 'moat', 'sentry', 'vassal', 'village', 'witch', 'workshop']
  }
];

// Initial supply is now generated dynamically in App.tsx based on selection
export const INITIAL_SUPPLY: Record<string, number> = {}; 

export const STARTING_DECK: CardDef[] = [
  CARDS.copper, CARDS.copper, CARDS.copper, CARDS.copper, CARDS.copper,
  CARDS.copper, CARDS.copper,
  CARDS.estate, CARDS.estate, CARDS.estate
];