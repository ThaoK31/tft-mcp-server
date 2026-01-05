import fetch from "node-fetch";

// Cache pour les données Data Dragon
let championsCache: Map<string, string> = new Map();
let itemsCache: Map<string, string> = new Map();
let traitsCache: Map<string, string> = new Map();
let augmentsCache: Map<string, string> = new Map();

// Full data caches for detailed info
let championsFullCache: Map<string, ChampionData> = new Map();
let traitsFullCache: Map<string, TraitData> = new Map();

let isInitialized = false;

const CDRAGON_BASE = "https://raw.communitydragon.org/latest/cdragon/tft/en_us.json";

// Full champion data structure
export interface ChampionData {
  apiName: string;
  name: string;
  cost: number;
  traits: string[];
  role: string | null;
  ability: {
    name: string;
    desc: string;
    variables: Array<{ name: string; value: number[] }>;
  };
  stats: {
    hp: number;
    damage: number;
    armor: number;
    magicResist: number;
    attackSpeed: number;
    critChance: number;
    critMultiplier: number;
    range: number;
    mana: number;
    initialMana: number;
  };
}

// Full trait data structure
export interface TraitData {
  apiName: string;
  name: string;
  desc: string;
  effects: Array<{
    minUnits: number;
    maxUnits: number;
    style: number;
    variables: Record<string, number>;
  }>;
}

interface CDragonData {
  sets: Record<string, {
    champions: Array<{
      apiName: string;
      name: string;
      cost: number;
      traits: string[];
      role: string | null;
      ability: {
        name: string;
        desc: string;
        variables: Array<{ name: string; value: number[] }>;
      };
      stats: {
        hp: number;
        damage: number;
        armor: number;
        magicResist: number;
        attackSpeed: number;
        critChance: number;
        critMultiplier: number;
        range: number;
        mana: number;
        initialMana: number;
      };
    }>;
    traits: Array<{
      apiName: string;
      name: string;
      desc: string;
      effects: Array<{
        minUnits: number;
        maxUnits: number;
        style: number;
        variables: Record<string, number>;
      }>;
    }>;
  }>;
  items: Array<{
    apiName: string;
    name: string;
  }>;
}

export async function initializeDataDragon(): Promise<void> {
  if (isInitialized) return;

  try {
    console.error("Loading Data Dragon...");
    const response = await fetch(CDRAGON_BASE);
    const data = await response.json() as CDragonData;

    // Charger les champions et traits du Set 16 (ou le dernier set disponible)
    const setKeys = Object.keys(data.sets).sort((a, b) => Number(a) - Number(b));
    const latestSet = setKeys[setKeys.length - 1];
    const setData = data.sets[latestSet];

    if (setData) {
      // Champions - name cache and full data
      for (const champ of setData.champions || []) {
        championsCache.set(champ.apiName.toLowerCase(), champ.name);
        // Store full data with lowercase name as key for easy lookup
        championsFullCache.set(champ.name.toLowerCase(), {
          apiName: champ.apiName,
          name: champ.name,
          cost: champ.cost,
          traits: champ.traits || [],
          role: champ.role,
          ability: champ.ability || { name: "", desc: "", variables: [] },
          stats: champ.stats || {
            hp: 0, damage: 0, armor: 0, magicResist: 0,
            attackSpeed: 0, critChance: 0, critMultiplier: 0,
            range: 0, mana: 0, initialMana: 0
          }
        });
      }

      // Traits - name cache and full data
      for (const trait of setData.traits || []) {
        traitsCache.set(trait.apiName.toLowerCase(), trait.name);
        traitsFullCache.set(trait.name.toLowerCase(), {
          apiName: trait.apiName,
          name: trait.name,
          desc: trait.desc || "",
          effects: trait.effects || []
        });
      }
    }

    // Items (globaux)
    for (const item of data.items || []) {
      itemsCache.set(item.apiName.toLowerCase(), item.name);
    }

    isInitialized = true;
    console.error(`Data Dragon loaded: ${championsFullCache.size} champions, ${itemsCache.size} items, ${traitsFullCache.size} traits`);
  } catch (error) {
    console.error("Failed to load Data Dragon, using fallback names:", error);
    isInitialized = true; // Éviter de réessayer en boucle
  }
}

// Convertit un ID API en nom lisible
export function getChampionName(apiName: string): string {
  // Ex: "TFT16_Kindred" -> "Kindred"
  const key = apiName.toLowerCase();
  if (championsCache.has(key)) {
    return championsCache.get(key)!;
  }
  // Fallback: extraire le nom après le préfixe TFT[X]_
  const match = apiName.match(/TFT\d+_(.+)/);
  return match ? match[1] : apiName;
}

export function getItemName(apiName: string): string {
  // Ex: "TFT_Item_GuinsoosRageblade" -> "Guinsoo's Rageblade"
  const key = apiName.toLowerCase();
  if (itemsCache.has(key)) {
    return itemsCache.get(key)!;
  }
  // Fallback: extraire et formater le nom
  const match = apiName.match(/TFT_Item_(.+)/);
  if (match) {
    // CamelCase to readable: "GuinsoosRageblade" -> "Guinsoos Rageblade"
    return match[1].replace(/([A-Z])/g, ' $1').trim();
  }
  return apiName;
}

export function getTraitName(apiName: string): string {
  // Ex: "TFT16_Ionia" -> "Ionia"
  const key = apiName.toLowerCase();
  if (traitsCache.has(key)) {
    return traitsCache.get(key)!;
  }
  // Fallback
  const match = apiName.match(/TFT\d+_(.+)/);
  return match ? match[1] : apiName;
}

// Formater une liste d'items
export function formatItems(itemNames: string[]): string[] {
  return itemNames.map(item => getItemName(item));
}

// Formater les traits actifs (style > 0 = actif)
export function formatActiveTraits(traits: Array<{ name: string; num_units: number; style: number; tier_current: number }>): string[] {
  return traits
    .filter(t => t.style > 0)
    .sort((a, b) => b.style - a.style) // Plus actif en premier
    .map(t => {
      const name = getTraitName(t.name);
      return `${name} ${t.num_units}`;
    });
}

// Formater les unités d'un joueur
export function formatUnits(units: Array<{ character_id: string; tier: number; itemNames: string[] }>): string[] {
  return units.map(u => {
    const name = getChampionName(u.character_id);
    const stars = "⭐".repeat(u.tier);
    const items = u.itemNames.length > 0 ? ` (${formatItems(u.itemNames).join(", ")})` : "";
    return `${name} ${stars}${items}`;
  });
}

// Rareté -> Coût
export function raritytoCost(rarity: number): number {
  const costMap: Record<number, number> = {
    0: 1,
    1: 2,
    2: 3,
    4: 4,
    6: 5,
    7: 5, // Légendaire/Special
  };
  return costMap[rarity] ?? rarity + 1;
}

// ============================================
// Full data getters for detailed info tools
// ============================================

/**
 * Get full champion data by name (fuzzy search)
 */
export function getChampionData(name: string): ChampionData | null {
  const searchName = name.toLowerCase().trim();

  // Exact match
  if (championsFullCache.has(searchName)) {
    return championsFullCache.get(searchName)!;
  }

  // Fuzzy match - search for partial matches
  for (const [key, data] of championsFullCache) {
    if (key.includes(searchName) || searchName.includes(key)) {
      return data;
    }
  }

  return null;
}

/**
 * Get full trait data by name (fuzzy search)
 */
export function getTraitData(name: string): TraitData | null {
  const searchName = name.toLowerCase().trim();

  // Exact match
  if (traitsFullCache.has(searchName)) {
    return traitsFullCache.get(searchName)!;
  }

  // Fuzzy match
  for (const [key, data] of traitsFullCache) {
    if (key.includes(searchName) || searchName.includes(key)) {
      return data;
    }
  }

  return null;
}

/**
 * Get all champions (for listing)
 */
export function getAllChampions(): ChampionData[] {
  return Array.from(championsFullCache.values())
    .filter(c => c.cost >= 1 && c.cost <= 5) // Only real champions, not items
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
}

/**
 * Get all traits (for listing)
 */
export function getAllTraits(): TraitData[] {
  return Array.from(traitsFullCache.values())
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get champions by trait
 */
export function getChampionsByTrait(traitName: string): ChampionData[] {
  const searchTrait = traitName.toLowerCase().trim();
  return getAllChampions().filter(c =>
    c.traits.some(t => t.toLowerCase().includes(searchTrait))
  );
}

/**
 * Get champions by cost
 */
export function getChampionsByCost(cost: number): ChampionData[] {
  return getAllChampions().filter(c => c.cost === cost);
}

/**
 * Clean ability description (remove HTML tags and placeholders)
 */
export function cleanAbilityDesc(desc: string, variables: Array<{ name: string; value: number[] }>, starLevel: number = 1): string {
  let cleaned = desc;

  // Replace variable placeholders with actual values
  for (const v of variables) {
    const value = v.value[starLevel] ?? v.value[1] ?? v.value[0];
    const formattedValue = typeof value === 'number' ?
      (value < 1 && value > 0 ? `${Math.round(value * 100)}%` : Math.round(value).toString()) :
      String(value);
    cleaned = cleaned.replace(new RegExp(`@${v.name}@`, 'gi'), formattedValue);
    cleaned = cleaned.replace(new RegExp(`@Modified${v.name}@`, 'gi'), formattedValue);
  }

  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  // Remove remaining @ placeholders
  cleaned = cleaned.replace(/@\w+@/g, '?');
  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  // Remove %i:scale* tags
  cleaned = cleaned.replace(/%i:scale\w+%/g, '');

  return cleaned;
}
