import {
  getChampionData,
  getTraitData,
  getAllChampions,
  getAllTraits,
  getChampionsByTrait,
  getChampionsByCost,
  cleanAbilityDesc,
  type ChampionData,
  type TraitData
} from "../datadragon.js";

// ============================================
// tft_champion_info
// ============================================

/**
 * Get detailed info about a specific champion
 */
export async function handleTftChampionInfo(params: { champion: string }) {
  const { champion } = params;

  const data = getChampionData(champion);

  if (!data) {
    const allChamps = getAllChampions();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: `Champion "${champion}" not found`,
          availableChampions: allChamps.map(c => c.name).slice(0, 30)
        }, null, 2)
      }],
      isError: true
    };
  }

  // Format ability description for each star level
  const abilityByStars: Record<string, string> = {};
  for (let star = 1; star <= 3; star++) {
    abilityByStars[`${star}star`] = cleanAbilityDesc(
      data.ability.desc,
      data.ability.variables,
      star
    );
  }

  const result = {
    name: data.name,
    cost: data.cost,
    traits: data.traits,
    role: data.role,
    ability: {
      name: data.ability.name,
      description: abilityByStars
    },
    stats: {
      hp: Math.round(data.stats.hp),
      damage: Math.round(data.stats.damage),
      armor: Math.round(data.stats.armor),
      magicResist: Math.round(data.stats.magicResist),
      attackSpeed: Math.round(data.stats.attackSpeed * 100) / 100,
      critChance: `${Math.round((data.stats.critChance || 0.25) * 100)}%`,
      critMultiplier: `${Math.round((data.stats.critMultiplier || 1.4) * 100)}%`,
      range: data.stats.range,
      mana: `${Math.round(data.stats.initialMana)}/${Math.round(data.stats.mana)}`
    }
  };

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: false
  };
}

// ============================================
// tft_trait_info
// ============================================

/**
 * Get detailed info about a specific trait
 */
export async function handleTftTraitInfo(params: { trait: string }) {
  const { trait } = params;

  const data = getTraitData(trait);

  if (!data) {
    const allTraits = getAllTraits();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: `Trait "${trait}" not found`,
          availableTraits: allTraits.map(t => t.name)
        }, null, 2)
      }],
      isError: true
    };
  }

  // Clean description
  let cleanDesc = data.desc
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/@\w+\*?\d*@/g, '?') // Remove placeholders
    .replace(/%i:scale\w+%/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Format breakpoints
  const breakpoints = data.effects.map(e => {
    const vars = Object.entries(e.variables)
      .map(([k, v]) => `${k}: ${typeof v === 'number' && v < 1 && v > 0 ? Math.round(v * 100) + '%' : Math.round(v as number)}`)
      .join(', ');
    return {
      units: e.minUnits,
      style: e.style, // 1=bronze, 3=silver, 5=gold, 7=prismatic
      stats: vars
    };
  });

  // Get champions with this trait
  const champions = getChampionsByTrait(data.name);

  const result = {
    name: data.name,
    description: cleanDesc,
    breakpoints,
    champions: champions.map(c => ({ name: c.name, cost: c.cost }))
  };

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: false
  };
}

// ============================================
// tft_list_champions
// ============================================

/**
 * List all champions, optionally filtered by cost or trait
 */
export async function handleTftListChampions(params: { cost?: number; trait?: string }) {
  const { cost, trait } = params;

  let champions: ChampionData[];

  if (cost) {
    champions = getChampionsByCost(cost);
  } else if (trait) {
    champions = getChampionsByTrait(trait);
  } else {
    champions = getAllChampions();
  }

  const result = {
    filter: cost ? `${cost}-cost` : trait ? `trait: ${trait}` : "all",
    count: champions.length,
    champions: champions.map(c => ({
      name: c.name,
      cost: c.cost,
      traits: c.traits,
      ability: c.ability.name
    }))
  };

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: false
  };
}

// ============================================
// tft_list_traits
// ============================================

/**
 * List all traits with their breakpoints
 */
export async function handleTftListTraits() {
  const traits = getAllTraits();

  const result = {
    count: traits.length,
    traits: traits.map(t => ({
      name: t.name,
      breakpoints: t.effects.map(e => e.minUnits),
      championCount: getChampionsByTrait(t.name).length
    }))
  };

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: false
  };
}
