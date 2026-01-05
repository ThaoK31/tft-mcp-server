import { getCurrentPuuid, fetchWithErrorHandling, getCurrentRiotApiBase } from "../utils.js";
import { getChampionName, getTraitName } from "../datadragon.js";
import { getArgs } from "../types.js";
import { getRiotAccountApi } from "../constants.js";
import fetch from "node-fetch";

const LOLCHESS_URL = "https://lolchess.gg";

interface PlayerStats {
  gameName: string;
  tagLine: string;
  puuid: string;
  rank?: string;
  matchesAnalyzed: number;
  avgPlacement: number;
  winRate: number;
  top4Rate: number;
  top1Count: number;
  top4Count: number;
  bot4Count: number;
  mostPlayedUnits: Array<{ name: string; count: number; avgPlacement: number }>;
  mostPlayedTraits: Array<{ name: string; count: number; avgPlacement: number }>;
  bestUnits: Array<{ name: string; count: number; avgPlacement: number }>;
  worstUnits: Array<{ name: string; count: number; avgPlacement: number }>;
}

interface MatchData {
  info: {
    participants: Array<{
      puuid: string;
      placement: number;
      units: Array<{ character_id: string }>;
      traits: Array<{ name: string; tier_current: number; num_units: number }>;
    }>;
  };
}

/**
 * Fetch PUUID for a player
 */
async function fetchPUUID(gameName: string, tagLine: string): Promise<string> {
  const args = getArgs();
  const accountApi = getRiotAccountApi(args.region);
  const url = `${accountApi}/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

  const response = await fetchWithErrorHandling(url);
  const data = await response.json() as { puuid: string };
  return data.puuid;
}

/**
 * Fetch ranked stats from lolchess
 */
async function fetchRank(gameName: string, tagLine: string, platform: string): Promise<string | undefined> {
  const url = `${LOLCHESS_URL}/profile/${platform}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html"
      }
    });

    if (!response.ok) return undefined;

    const html = await response.text();
    const tierMatch = html.match(/profile__tier[^>]*>([^<]+)</i);
    const rankMatch = html.match(/<span class="profile__tier__division"[^>]*>([IViv]+)<\/span>/i);
    const lpMatch = html.match(/(\d+)\s*LP/i);

    if (!tierMatch) return undefined;

    const tier = tierMatch[1].trim();
    const rank = rankMatch ? rankMatch[1].toUpperCase() : "";
    const lp = lpMatch ? lpMatch[1] : "0";

    return `${tier} ${rank} ${lp} LP`.trim();
  } catch {
    return undefined;
  }
}

/**
 * Analyze matches for a player
 */
async function analyzePlayer(puuid: string, gameName: string, tagLine: string, matchCount: number): Promise<PlayerStats> {
  const args = getArgs();
  const apiBase = getCurrentRiotApiBase();

  // Fetch match history
  const historyUrl = `${apiBase}/tft/match/v1/matches/by-puuid/${puuid}/ids?count=${matchCount}`;
  const historyResponse = await fetchWithErrorHandling(historyUrl);
  const matchIds = await historyResponse.json() as string[];

  // Fetch match details
  const placements: number[] = [];
  const unitStats: Record<string, { count: number; placements: number[] }> = {};
  const traitStats: Record<string, { count: number; placements: number[] }> = {};

  for (const matchId of matchIds) {
    const matchUrl = `${apiBase}/tft/match/v1/matches/${matchId}`;
    const matchResponse = await fetchWithErrorHandling(matchUrl);
    const matchData = await matchResponse.json() as MatchData;

    const player = matchData.info.participants.find(p => p.puuid === puuid);
    if (!player) continue;

    placements.push(player.placement);

    // Track units
    for (const unit of player.units) {
      const name = getChampionName(unit.character_id);
      if (!unitStats[name]) {
        unitStats[name] = { count: 0, placements: [] };
      }
      unitStats[name].count++;
      unitStats[name].placements.push(player.placement);
    }

    // Track traits
    for (const trait of player.traits) {
      if (trait.tier_current > 0) {
        const name = `${getTraitName(trait.name)} ${trait.num_units}`;
        if (!traitStats[name]) {
          traitStats[name] = { count: 0, placements: [] };
        }
        traitStats[name].count++;
        traitStats[name].placements.push(player.placement);
      }
    }
  }

  // Calculate stats
  const avgPlacement = placements.length > 0
    ? placements.reduce((a, b) => a + b, 0) / placements.length
    : 0;
  const top1Count = placements.filter(p => p === 1).length;
  const top4Count = placements.filter(p => p <= 4).length;
  const bot4Count = placements.filter(p => p > 4).length;

  // Process unit stats
  const unitList = Object.entries(unitStats)
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      avgPlacement: Math.round((stats.placements.reduce((a, b) => a + b, 0) / stats.placements.length) * 100) / 100
    }));

  const mostPlayedUnits = [...unitList].sort((a, b) => b.count - a.count).slice(0, 5);
  const bestUnits = unitList.filter(u => u.count >= 2).sort((a, b) => a.avgPlacement - b.avgPlacement).slice(0, 5);
  const worstUnits = unitList.filter(u => u.count >= 2).sort((a, b) => b.avgPlacement - a.avgPlacement).slice(0, 5);

  // Process trait stats
  const traitList = Object.entries(traitStats)
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      avgPlacement: Math.round((stats.placements.reduce((a, b) => a + b, 0) / stats.placements.length) * 100) / 100
    }));

  const mostPlayedTraits = [...traitList].sort((a, b) => b.count - a.count).slice(0, 5);

  // Fetch rank
  const rank = await fetchRank(gameName, tagLine, args.platform);

  return {
    gameName,
    tagLine,
    puuid,
    rank,
    matchesAnalyzed: placements.length,
    avgPlacement: Math.round(avgPlacement * 100) / 100,
    winRate: placements.length > 0 ? Math.round((top1Count / placements.length) * 100) : 0,
    top4Rate: placements.length > 0 ? Math.round((top4Count / placements.length) * 100) : 0,
    top1Count,
    top4Count,
    bot4Count,
    mostPlayedUnits,
    mostPlayedTraits,
    bestUnits,
    worstUnits
  };
}

/**
 * Compare two stats and return comparison indicator
 */
function compare(val1: number, val2: number, lowerIsBetter: boolean = false): string {
  if (val1 === val2) return "=";
  if (lowerIsBetter) {
    return val1 < val2 ? "✓" : "✗";
  }
  return val1 > val2 ? "✓" : "✗";
}

/**
 * Handler for tft_compare_players tool
 */
export async function handleTftComparePlayers(params: { gameName: string; tagLine: string; matchCount?: number }) {
  const { gameName, tagLine, matchCount = 10 } = params;
  const args = getArgs();
  const myPuuid = getCurrentPuuid();

  if (!myPuuid) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "PUUID not initialized" }, null, 2) }],
      isError: true
    };
  }

  try {
    // Fetch opponent PUUID
    const opponentPuuid = await fetchPUUID(gameName, tagLine);

    // Analyze both players in parallel
    const [myStats, opponentStats] = await Promise.all([
      analyzePlayer(myPuuid, args.gameName, args.tagLine, matchCount),
      analyzePlayer(opponentPuuid, gameName, tagLine, matchCount)
    ]);

    // Build comparison
    const comparison = {
      you: {
        name: `${myStats.gameName}#${myStats.tagLine}`,
        rank: myStats.rank || "Unknown",
        matchesAnalyzed: myStats.matchesAnalyzed,
        avgPlacement: myStats.avgPlacement,
        winRate: `${myStats.winRate}%`,
        top4Rate: `${myStats.top4Rate}%`,
        record: `${myStats.top1Count}W / ${myStats.top4Count - myStats.top1Count}T4 / ${myStats.bot4Count}B4`
      },
      opponent: {
        name: `${opponentStats.gameName}#${opponentStats.tagLine}`,
        rank: opponentStats.rank || "Unknown",
        matchesAnalyzed: opponentStats.matchesAnalyzed,
        avgPlacement: opponentStats.avgPlacement,
        winRate: `${opponentStats.winRate}%`,
        top4Rate: `${opponentStats.top4Rate}%`,
        record: `${opponentStats.top1Count}W / ${opponentStats.top4Count - opponentStats.top1Count}T4 / ${opponentStats.bot4Count}B4`
      },
      verdict: {
        avgPlacement: `${compare(myStats.avgPlacement, opponentStats.avgPlacement, true)} You: ${myStats.avgPlacement} vs ${opponentStats.avgPlacement}`,
        winRate: `${compare(myStats.winRate, opponentStats.winRate)} You: ${myStats.winRate}% vs ${opponentStats.winRate}%`,
        top4Rate: `${compare(myStats.top4Rate, opponentStats.top4Rate)} You: ${myStats.top4Rate}% vs ${opponentStats.top4Rate}%`
      },
      playstyleComparison: {
        yourTopUnits: myStats.mostPlayedUnits.map(u => u.name),
        theirTopUnits: opponentStats.mostPlayedUnits.map(u => u.name),
        sharedUnits: myStats.mostPlayedUnits
          .filter(u => opponentStats.mostPlayedUnits.some(o => o.name === u.name))
          .map(u => u.name),
        yourTopTraits: myStats.mostPlayedTraits.map(t => t.name),
        theirTopTraits: opponentStats.mostPlayedTraits.map(t => t.name)
      },
      detailedStats: {
        you: {
          bestUnits: myStats.bestUnits,
          worstUnits: myStats.worstUnits,
          mostPlayedTraits: myStats.mostPlayedTraits
        },
        opponent: {
          bestUnits: opponentStats.bestUnits,
          worstUnits: opponentStats.worstUnits,
          mostPlayedTraits: opponentStats.mostPlayedTraits
        }
      }
    };

    return {
      content: [{ type: "text", text: JSON.stringify(comparison, null, 2) }],
      isError: false
    };

  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2) }],
      isError: true
    };
  }
}
