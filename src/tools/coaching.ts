import { CURRENT_PUUID, fetchWithErrorHandling, getCurrentRiotApiBase } from "../utils.js";
import { getChampionName, getItemName, getTraitName, formatActiveTraits, raritytoCost } from "../datadragon.js";
import { getArgs } from "../types.js";
import fetch from "node-fetch";

const METATFT_API = "https://api-hc.metatft.com";

interface MatchData {
  metadata: { match_id: string };
  info: {
    game_datetime: number;
    participants: Array<{
      puuid: string;
      placement: number;
      level: number;
      traits: Array<{ name: string; tier_current: number; num_units: number }>;
      units: Array<{ character_id: string; tier: number; rarity: number; itemNames: string[] }>;
      augments?: string[];
    }>;
  };
}

interface MetaComp {
  name: string;
  tier: string;
  winRate: number;
  avgPlacement: number;
  units: string[];
}

interface MetaUnit {
  name: string;
  avgPlacement: number;
  winRate: number;
  top4Rate: number;
}

interface MetaItem {
  name: string;
  avgPlacement: number;
  winRate: number;
}

/**
 * Fetch recent match data for analysis
 */
async function fetchRecentMatches(count: number): Promise<MatchData[]> {
  const apiBase = getCurrentRiotApiBase();
  const historyUrl = `${apiBase}/tft/match/v1/matches/by-puuid/${CURRENT_PUUID}/ids?count=${count}`;

  const historyResponse = await fetchWithErrorHandling(historyUrl);
  const matchIds = await historyResponse.json() as string[];

  const matches: MatchData[] = [];
  for (const matchId of matchIds) {
    const matchUrl = `${apiBase}/tft/match/v1/matches/${matchId}`;
    const matchResponse = await fetchWithErrorHandling(matchUrl);
    matches.push(await matchResponse.json() as MatchData);
  }

  return matches;
}

/**
 * Fetch meta units for comparison
 */
async function fetchMetaUnits(): Promise<MetaUnit[]> {
  const url = `${METATFT_API}/tft-stat-api/units?queue=1100&patch=current&days=3&rank=DIAMOND,MASTER,GRANDMASTER,CHALLENGER`;
  const response = await fetch(url, {
    headers: { "User-Agent": "TFT-MCP-Server/1.0", "Accept": "application/json" }
  });

  if (!response.ok) return [];

  const data = await response.json() as any;
  const results: MetaUnit[] = [];

  for (const [unitId, stats] of Object.entries(data)) {
    const s = stats as any;
    if (!s.placements) continue;

    const placements = s.placements as number[];
    const total = placements.reduce((a: number, b: number) => a + b, 0);
    if (total < 100) continue;

    const avgPlacement = placements.reduce((sum, count, idx) => sum + count * (idx + 1), 0) / total;
    const winRate = (placements[0] / total) * 100;
    const top4 = placements.slice(0, 4).reduce((a, b) => a + b, 0);
    const top4Rate = (top4 / total) * 100;

    results.push({
      name: getChampionName(unitId),
      avgPlacement: Math.round(avgPlacement * 100) / 100,
      winRate: Math.round(winRate * 10) / 10,
      top4Rate: Math.round(top4Rate * 10) / 10
    });
  }

  return results.sort((a, b) => a.avgPlacement - b.avgPlacement);
}

/**
 * Fetch meta items for comparison
 */
async function fetchMetaItems(): Promise<MetaItem[]> {
  const url = `${METATFT_API}/tft-stat-api/items?queue=1100&patch=current&days=3&rank=DIAMOND,MASTER,GRANDMASTER,CHALLENGER`;
  const response = await fetch(url, {
    headers: { "User-Agent": "TFT-MCP-Server/1.0", "Accept": "application/json" }
  });

  if (!response.ok) return [];

  const data = await response.json() as any;
  const results: MetaItem[] = [];

  for (const [itemId, stats] of Object.entries(data)) {
    const s = stats as any;
    if (!s.placements) continue;

    const placements = s.placements as number[];
    const total = placements.reduce((a: number, b: number) => a + b, 0);
    if (total < 100) continue;

    const avgPlacement = placements.reduce((sum, count, idx) => sum + count * (idx + 1), 0) / total;
    const winRate = (placements[0] / total) * 100;

    results.push({
      name: getItemName(itemId),
      avgPlacement: Math.round(avgPlacement * 100) / 100,
      winRate: Math.round(winRate * 10) / 10
    });
  }

  return results.sort((a, b) => a.avgPlacement - b.avgPlacement);
}

/**
 * Analyze player's match history and generate coaching insights
 */
export async function handleTftCoaching(params: { matchCount?: number }) {
  const { matchCount = 10 } = params;

  try {
    // Fetch data in parallel
    const [matches, metaUnits, metaItems] = await Promise.all([
      fetchRecentMatches(matchCount),
      fetchMetaUnits(),
      fetchMetaItems()
    ]);

    if (matches.length === 0) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "No recent matches found" }, null, 2) }],
        isError: true
      };
    }

    // Analyze player's performance
    const playerStats = {
      placements: [] as number[],
      unitsPlayed: {} as Record<string, { count: number; placements: number[] }>,
      itemsUsed: {} as Record<string, { count: number; placements: number[] }>,
      traitsActivated: {} as Record<string, { count: number; placements: number[] }>,
      augmentsPicked: {} as Record<string, { count: number; placements: number[] }>
    };

    for (const match of matches) {
      const player = match.info.participants.find(p => p.puuid === CURRENT_PUUID);
      if (!player) continue;

      playerStats.placements.push(player.placement);

      // Track units
      for (const unit of player.units) {
        const name = getChampionName(unit.character_id);
        if (!playerStats.unitsPlayed[name]) {
          playerStats.unitsPlayed[name] = { count: 0, placements: [] };
        }
        playerStats.unitsPlayed[name].count++;
        playerStats.unitsPlayed[name].placements.push(player.placement);

        // Track items
        for (const item of unit.itemNames) {
          const itemName = getItemName(item);
          if (!playerStats.itemsUsed[itemName]) {
            playerStats.itemsUsed[itemName] = { count: 0, placements: [] };
          }
          playerStats.itemsUsed[itemName].count++;
          playerStats.itemsUsed[itemName].placements.push(player.placement);
        }
      }

      // Track traits
      for (const trait of player.traits) {
        if (trait.tier_current > 0) {
          const traitName = getTraitName(trait.name);
          const key = `${traitName} ${trait.num_units}`;
          if (!playerStats.traitsActivated[key]) {
            playerStats.traitsActivated[key] = { count: 0, placements: [] };
          }
          playerStats.traitsActivated[key].count++;
          playerStats.traitsActivated[key].placements.push(player.placement);
        }
      }

      // Track augments
      if (player.augments) {
        for (const aug of player.augments) {
          const match = aug.match(/TFT\d+_Augment_(.+)/);
          const augName = match ? match[1].replace(/([A-Z])/g, ' $1').trim() : aug;
          if (!playerStats.augmentsPicked[augName]) {
            playerStats.augmentsPicked[augName] = { count: 0, placements: [] };
          }
          playerStats.augmentsPicked[augName].count++;
          playerStats.augmentsPicked[augName].placements.push(player.placement);
        }
      }
    }

    // Calculate averages
    const avgPlacement = playerStats.placements.reduce((a, b) => a + b, 0) / playerStats.placements.length;
    const top4Count = playerStats.placements.filter(p => p <= 4).length;
    const winCount = playerStats.placements.filter(p => p === 1).length;

    // Find best and worst performing units
    const unitPerformance = Object.entries(playerStats.unitsPlayed)
      .filter(([_, stats]) => stats.count >= 2)
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        avgPlacement: Math.round((stats.placements.reduce((a, b) => a + b, 0) / stats.placements.length) * 100) / 100
      }))
      .sort((a, b) => a.avgPlacement - b.avgPlacement);

    const bestUnits = unitPerformance.slice(0, 5);
    const worstUnits = unitPerformance.slice(-5).reverse();

    // Compare with meta
    const metaUnitMap = new Map(metaUnits.map(u => [u.name, u]));
    const underutilizedMeta = metaUnits
      .filter(u => u.avgPlacement <= 4.0 && !playerStats.unitsPlayed[u.name])
      .slice(0, 5);

    // Find units player uses that underperform vs meta
    const underperforming = unitPerformance
      .filter(u => {
        const meta = metaUnitMap.get(u.name);
        return meta && u.avgPlacement > meta.avgPlacement + 0.5;
      })
      .slice(0, 5);

    // Item analysis
    const itemPerformance = Object.entries(playerStats.itemsUsed)
      .filter(([_, stats]) => stats.count >= 3)
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        avgPlacement: Math.round((stats.placements.reduce((a, b) => a + b, 0) / stats.placements.length) * 100) / 100
      }))
      .sort((a, b) => a.avgPlacement - b.avgPlacement);

    // Best items meta that player doesn't use
    const metaItemMap = new Map(metaItems.map(i => [i.name, i]));
    const underutilizedItems = metaItems
      .filter(i => i.avgPlacement <= 4.0 && !playerStats.itemsUsed[i.name])
      .slice(0, 5);

    // Generate recommendations
    const recommendations: string[] = [];

    if (avgPlacement > 4.5) {
      recommendations.push("🎯 Focus on consistent top 4 finishes before aiming for wins");
    }

    if (underutilizedMeta.length > 0) {
      recommendations.push(`📈 Try meta units you haven't played: ${underutilizedMeta.map(u => u.name).join(", ")}`);
    }

    if (underperforming.length > 0) {
      recommendations.push(`⚠️ These units underperform for you vs meta: ${underperforming.map(u => u.name).join(", ")}`);
    }

    if (worstUnits.length > 0 && worstUnits[0].avgPlacement > 5) {
      recommendations.push(`❌ Avoid: ${worstUnits.slice(0, 3).map(u => `${u.name} (avg ${u.avgPlacement})`).join(", ")}`);
    }

    if (underutilizedItems.length > 0) {
      recommendations.push(`🔧 Try these strong items: ${underutilizedItems.slice(0, 3).map(i => i.name).join(", ")}`);
    }

    // Trait recommendations
    const traitPerformance = Object.entries(playerStats.traitsActivated)
      .filter(([_, stats]) => stats.count >= 2)
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        avgPlacement: Math.round((stats.placements.reduce((a, b) => a + b, 0) / stats.placements.length) * 100) / 100
      }))
      .sort((a, b) => a.avgPlacement - b.avgPlacement);

    const bestTraits = traitPerformance.slice(0, 3);
    if (bestTraits.length > 0) {
      recommendations.push(`✨ Your best traits: ${bestTraits.map(t => `${t.name} (avg ${t.avgPlacement})`).join(", ")}`);
    }

    const result = {
      summary: {
        matchesAnalyzed: matches.length,
        avgPlacement: Math.round(avgPlacement * 100) / 100,
        top4Rate: `${Math.round((top4Count / matches.length) * 100)}%`,
        winRate: `${Math.round((winCount / matches.length) * 100)}%`,
        placementDistribution: {
          "1st": playerStats.placements.filter(p => p === 1).length,
          "2nd": playerStats.placements.filter(p => p === 2).length,
          "3rd": playerStats.placements.filter(p => p === 3).length,
          "4th": playerStats.placements.filter(p => p === 4).length,
          "5th-8th": playerStats.placements.filter(p => p > 4).length
        }
      },
      unitAnalysis: {
        bestPerforming: bestUnits,
        worstPerforming: worstUnits,
        underperformingVsMeta: underperforming,
        metaUnitsToTry: underutilizedMeta.map(u => ({
          name: u.name,
          metaAvgPlacement: u.avgPlacement,
          metaTop4Rate: `${u.top4Rate}%`
        }))
      },
      itemAnalysis: {
        mostUsed: itemPerformance.slice(0, 5),
        metaItemsToTry: underutilizedItems.map(i => ({
          name: i.name,
          metaAvgPlacement: i.avgPlacement
        }))
      },
      traitAnalysis: {
        bestTraits: bestTraits,
        worstTraits: traitPerformance.slice(-3).reverse()
      },
      recommendations
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: false
    };

  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2) }],
      isError: true
    };
  }
}
