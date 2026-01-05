import { getCurrentPuuid, fetchWithErrorHandling, getCurrentRiotApiBase } from "../utils.js";
import { getChampionName, getItemName, getTraitName } from "../datadragon.js";
import { getArgs } from "../types.js";
import { getRiotAccountApi } from "../constants.js";
import fetch from "node-fetch";

const METATFT_API = "https://api-hc.metatft.com";
const LOLCHESS_URL = "https://lolchess.gg";

// ============================================
// tft_item_recommendations
// ============================================

interface UnitBuild {
  items: string[];
  games: number;
  avgPlacement: number;
}

/**
 * Get item recommendations for a specific champion
 */
export async function handleTftItemRecommendations(params: { champion: string }) {
  const { champion } = params;
  const searchName = champion.toLowerCase().trim();

  try {
    // Fetch unit builds from MetaTFT
    const url = `${METATFT_API}/tft-comps-api/unit_items_processed?region_hint=euw1`;
    const response = await fetch(url, {
      headers: { "User-Agent": "TFT-MCP-Server/1.0", "Accept": "application/json" }
    });

    if (!response.ok) {
      throw new Error(`MetaTFT API error: ${response.status}`);
    }

    const data = await response.json() as Record<string, any>;

    // Find the champion (fuzzy match)
    let foundChampion: string | null = null;
    let championData: any = null;

    for (const [unitId, unitData] of Object.entries(data)) {
      const name = getChampionName(unitId).toLowerCase();
      if (name === searchName || name.includes(searchName) || unitId.toLowerCase().includes(searchName)) {
        foundChampion = getChampionName(unitId);
        championData = unitData;
        break;
      }
    }

    if (!foundChampion || !championData) {
      // List available champions
      const availableChampions = Object.keys(data)
        .map(id => getChampionName(id))
        .filter(name => name && !name.startsWith("TFT"))
        .sort();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `Champion "${champion}" not found`,
            suggestion: "Try one of these champions",
            availableChampions: availableChampions.slice(0, 20)
          }, null, 2)
        }],
        isError: true
      };
    }

    // Parse item builds
    const builds: UnitBuild[] = [];
    if (championData.item_builds) {
      for (const [itemCombo, stats] of Object.entries(championData.item_builds)) {
        const s = stats as any;
        if (s.count && s.count >= 50) {
          const items = itemCombo.split(",").map((id: string) => getItemName(id.trim()));
          const placements = s.placements || [];
          const total = placements.reduce((a: number, b: number) => a + b, 0);
          const avgPlacement = total > 0
            ? placements.reduce((sum: number, count: number, idx: number) => sum + count * (idx + 1), 0) / total
            : 5;

          builds.push({
            items,
            games: s.count,
            avgPlacement: Math.round(avgPlacement * 100) / 100
          });
        }
      }
    }

    // Sort by avg placement
    builds.sort((a, b) => a.avgPlacement - b.avgPlacement);

    // Get best individual items
    const itemStats: Record<string, { count: number; placements: number[] }> = {};
    if (championData.item_builds) {
      for (const [itemCombo, stats] of Object.entries(championData.item_builds)) {
        const s = stats as any;
        const items = itemCombo.split(",");
        for (const item of items) {
          const itemName = getItemName(item.trim());
          if (!itemStats[itemName]) {
            itemStats[itemName] = { count: 0, placements: [] };
          }
          itemStats[itemName].count += s.count || 0;
          if (s.placements) {
            for (let i = 0; i < s.placements.length; i++) {
              if (!itemStats[itemName].placements[i]) itemStats[itemName].placements[i] = 0;
              itemStats[itemName].placements[i] += s.placements[i];
            }
          }
        }
      }
    }

    const bestItems = Object.entries(itemStats)
      .filter(([_, s]) => s.count >= 100)
      .map(([name, s]) => {
        const total = s.placements.reduce((a, b) => a + b, 0);
        const avgPlacement = total > 0
          ? s.placements.reduce((sum, count, idx) => sum + count * (idx + 1), 0) / total
          : 5;
        return { name, games: s.count, avgPlacement: Math.round(avgPlacement * 100) / 100 };
      })
      .sort((a, b) => a.avgPlacement - b.avgPlacement)
      .slice(0, 10);

    const result = {
      champion: foundChampion,
      bestBuilds: builds.slice(0, 5).map((b, i) => ({
        rank: i + 1,
        items: b.items,
        avgPlacement: b.avgPlacement,
        games: b.games
      })),
      bestIndividualItems: bestItems,
      tip: builds.length > 0
        ? `Best in slot: ${builds[0].items.join(" + ")} (avg ${builds[0].avgPlacement})`
        : "Not enough data for this champion"
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

// ============================================
// tft_export_data
// ============================================

interface MatchData {
  info: {
    game_datetime: number;
    participants: Array<{
      puuid: string;
      placement: number;
      level: number;
      gold_left: number;
      units: Array<{ character_id: string; tier: number; itemNames: string[] }>;
      traits: Array<{ name: string; tier_current: number; num_units: number }>;
      augments?: string[];
    }>;
  };
}

/**
 * Export match data to CSV or JSON format
 */
export async function handleTftExportData(params: { format?: "csv" | "json"; matchCount?: number }) {
  const { format = "json", matchCount = 10 } = params;
  const puuid = getCurrentPuuid();

  if (!puuid) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "PUUID not initialized" }, null, 2) }],
      isError: true
    };
  }

  try {
    const apiBase = getCurrentRiotApiBase();
    const historyUrl = `${apiBase}/tft/match/v1/matches/by-puuid/${puuid}/ids?count=${matchCount}`;
    const historyResponse = await fetchWithErrorHandling(historyUrl);
    const matchIds = await historyResponse.json() as string[];

    const matches: any[] = [];

    for (const matchId of matchIds) {
      const matchUrl = `${apiBase}/tft/match/v1/matches/${matchId}`;
      const matchResponse = await fetchWithErrorHandling(matchUrl);
      const matchData = await matchResponse.json() as MatchData;

      const player = matchData.info.participants.find(p => p.puuid === puuid);
      if (!player) continue;

      const units = player.units.map(u => ({
        champion: getChampionName(u.character_id),
        stars: u.tier,
        items: u.itemNames.map(i => getItemName(i))
      }));

      const traits = player.traits
        .filter(t => t.tier_current > 0)
        .map(t => `${getTraitName(t.name)} ${t.num_units}`);

      matches.push({
        matchId,
        date: new Date(matchData.info.game_datetime).toISOString(),
        placement: player.placement,
        level: player.level,
        goldLeft: player.gold_left,
        units,
        traits,
        augments: player.augments?.map(a => {
          const match = a.match(/TFT\d+_Augment_(.+)/);
          return match ? match[1] : a;
        }) || []
      });
    }

    if (format === "csv") {
      // Generate CSV
      const headers = ["matchId", "date", "placement", "level", "goldLeft", "units", "traits", "augments"];
      const rows = matches.map(m => [
        m.matchId,
        m.date,
        m.placement,
        m.level,
        m.goldLeft,
        m.units.map((u: any) => `${u.champion}*${u.stars}`).join(";"),
        m.traits.join(";"),
        m.augments.join(";")
      ]);

      const csv = [
        headers.join(","),
        ...rows.map(r => r.map((v: any) => `"${v}"`).join(","))
      ].join("\n");

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            format: "csv",
            matchCount: matches.length,
            data: csv
          }, null, 2)
        }],
        isError: false
      };
    }

    // JSON format
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          format: "json",
          matchCount: matches.length,
          data: matches
        }, null, 2)
      }],
      isError: false
    };

  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2) }],
      isError: true
    };
  }
}

// ============================================
// tft_lookup_player
// ============================================

/**
 * Lookup any player's stats and recent performance
 */
export async function handleTftLookupPlayer(params: { gameName: string; tagLine: string; matchCount?: number }) {
  const { gameName, tagLine, matchCount = 5 } = params;
  const args = getArgs();

  try {
    // Get PUUID
    const accountApi = getRiotAccountApi(args.region);
    const accountUrl = `${accountApi}/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const accountResponse = await fetchWithErrorHandling(accountUrl);
    const accountData = await accountResponse.json() as { puuid: string };
    const puuid = accountData.puuid;

    // Fetch rank from lolchess
    let rank = "Unknown";
    try {
      const lolchessUrl = `${LOLCHESS_URL}/profile/${args.platform}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
      const lolchessResponse = await fetch(lolchessUrl, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" }
      });
      if (lolchessResponse.ok) {
        const html = await lolchessResponse.text();
        const tierMatch = html.match(/profile__tier[^>]*>([^<]+)</i);
        const rankMatch = html.match(/<span class="profile__tier__division"[^>]*>([IViv]+)<\/span>/i);
        const lpMatch = html.match(/(\d+)\s*LP/i);
        if (tierMatch) {
          rank = `${tierMatch[1].trim()} ${rankMatch ? rankMatch[1].toUpperCase() : ""} ${lpMatch ? lpMatch[1] + " LP" : ""}`.trim();
        }
      }
    } catch {}

    // Fetch recent matches
    const apiBase = getCurrentRiotApiBase();
    const historyUrl = `${apiBase}/tft/match/v1/matches/by-puuid/${puuid}/ids?count=${matchCount}`;
    const historyResponse = await fetchWithErrorHandling(historyUrl);
    const matchIds = await historyResponse.json() as string[];

    const recentMatches: any[] = [];
    const placements: number[] = [];

    for (const matchId of matchIds) {
      const matchUrl = `${apiBase}/tft/match/v1/matches/${matchId}`;
      const matchResponse = await fetchWithErrorHandling(matchUrl);
      const matchData = await matchResponse.json() as MatchData;

      const player = matchData.info.participants.find(p => p.puuid === puuid);
      if (!player) continue;

      placements.push(player.placement);

      const topUnits = player.units
        .sort((a, b) => b.tier - a.tier)
        .slice(0, 3)
        .map(u => `${getChampionName(u.character_id)}*${u.tier}`);

      recentMatches.push({
        matchId,
        date: new Date(matchData.info.game_datetime).toLocaleDateString(),
        placement: player.placement,
        level: player.level,
        topUnits
      });
    }

    // Calculate stats
    const avgPlacement = placements.length > 0
      ? Math.round((placements.reduce((a, b) => a + b, 0) / placements.length) * 100) / 100
      : 0;
    const top4Count = placements.filter(p => p <= 4).length;
    const winCount = placements.filter(p => p === 1).length;

    const result = {
      player: `${gameName}#${tagLine}`,
      rank,
      recentPerformance: {
        matchesAnalyzed: placements.length,
        avgPlacement,
        winRate: placements.length > 0 ? `${Math.round((winCount / placements.length) * 100)}%` : "0%",
        top4Rate: placements.length > 0 ? `${Math.round((top4Count / placements.length) * 100)}%` : "0%"
      },
      recentMatches
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
