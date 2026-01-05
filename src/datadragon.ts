import fetch from "node-fetch";

// Cache pour les données Data Dragon
let championsCache: Map<string, string> = new Map();
let itemsCache: Map<string, string> = new Map();
let traitsCache: Map<string, string> = new Map();
let augmentsCache: Map<string, string> = new Map();
let isInitialized = false;

const CDRAGON_BASE = "https://raw.communitydragon.org/latest/cdragon/tft/en_us.json";

interface CDragonData {
  sets: Record<string, {
    champions: Array<{
      apiName: string;
      name: string;
    }>;
    traits: Array<{
      apiName: string;
      name: string;
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
    const setKeys = Object.keys(data.sets).sort();
    const latestSet = setKeys[setKeys.length - 1];
    const setData = data.sets[latestSet];

    if (setData) {
      // Champions
      for (const champ of setData.champions || []) {
        championsCache.set(champ.apiName.toLowerCase(), champ.name);
      }

      // Traits
      for (const trait of setData.traits || []) {
        traitsCache.set(trait.apiName.toLowerCase(), trait.name);
      }
    }

    // Items (globaux)
    for (const item of data.items || []) {
      itemsCache.set(item.apiName.toLowerCase(), item.name);
    }

    isInitialized = true;
    console.error(`Data Dragon loaded: ${championsCache.size} champions, ${itemsCache.size} items, ${traitsCache.size} traits`);
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
