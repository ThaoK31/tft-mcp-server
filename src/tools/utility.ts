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
export async function handleTftBestItems(params: { champion: string }) {
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

    const json = await response.json() as Record<string, any>;
    const unitsData = json?.units || {};

    // Find the champion (fuzzy match)
    let foundChampion: string | null = null;
    let championData: any = null;

    for (const [unitId, unitData] of Object.entries(unitsData)) {
      // Clean unitId: TFT16_Kindred -> Kindred
      const cleanedName = unitId.replace(/^TFT\d+_/, "").toLowerCase();
      if (cleanedName === searchName || cleanedName.includes(searchName) || unitId.toLowerCase().includes(searchName)) {
        foundChampion = unitId.replace(/^TFT\d+_/, "");
        championData = unitData;
        break;
      }
    }

    if (!foundChampion || !championData) {
      // List available champions
      const availableChampions = Object.keys(unitsData)
        .map(id => id.replace(/^TFT\d+_/, ""))
        .filter(name => name && name.length > 0)
        .sort()
        .slice(0, 30);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `Champion "${champion}" not found`,
            suggestion: "Try one of these champions",
            availableChampions
          }, null, 2)
        }],
        isError: true
      };
    }

    // Get best items for this champion (from items array)
    const items = (championData.items || []).slice(0, 10).map((i: any) => {
      const itemName = (i.itemName || "").replace(/^TFT_Item_/, "").replace(/_/g, " ");
      return {
        name: itemName,
        avgPlacement: i.avg?.toFixed(2) || "-",
        pickRate: `${((i.pick || 0) * 100).toFixed(1)}%`,
        games: i.count || 0
      };
    });

    // Get champion overall stats
    const avgPlacement = championData.avg?.toFixed(2) || "-";
    const pickRate = `${((championData.pick || 0) * 100).toFixed(1)}%`;
    const games = championData.count || 0;

    const result = {
      champion: foundChampion,
      overallStats: {
        avgPlacement,
        pickRate,
        games
      },
      bestItems: items,
      tip: items.length > 0
        ? `Best in slot: ${items.slice(0, 3).map((i: any) => i.name).join(" + ")}`
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
