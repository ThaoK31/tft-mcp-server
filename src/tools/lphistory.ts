import { getCurrentPuuid, fetchWithErrorHandling, getCurrentRiotApiBase } from "../utils.js";
import { getArgs } from "../types.js";
import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";

const LOLCHESS_URL = "https://lolchess.gg";

interface LPEntry {
  timestamp: number;
  matchId: string;
  placement: number;
  lpBefore: number;
  lpAfter: number;
  lpChange: number;
  tier: string;
  rank: string;
}

interface LPHistoryData {
  puuid: string;
  gameName: string;
  entries: LPEntry[];
  lastUpdated: number;
}

/**
 * Get LP history file path
 */
function getHistoryFilePath(): string {
  const args = getArgs();
  const filename = `lp-history-${args.gameName.toLowerCase()}-${args.tagLine.toLowerCase()}.json`;
  // Store in user data directory or project directory
  return path.join(process.cwd(), filename);
}

/**
 * Load LP history from file
 */
function loadHistory(): LPHistoryData | null {
  const filePath = getHistoryFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) as LPHistoryData;
    }
  } catch (error) {
    console.error("Failed to load LP history:", error);
  }
  return null;
}

/**
 * Save LP history to file
 */
function saveHistory(history: LPHistoryData): void {
  const filePath = getHistoryFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(history, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save LP history:", error);
  }
}

/**
 * Scrape current LP from lolchess.gg
 */
async function fetchCurrentLP(): Promise<{ tier: string; rank: string; lp: number } | null> {
  const args = getArgs();
  const url = `${LOLCHESS_URL}/profile/${args.platform}/${encodeURIComponent(args.gameName)}-${encodeURIComponent(args.tagLine)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html"
      }
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Extract rank info from lolchess page
    const tierMatch = html.match(/profile__tier[^>]*>([^<]+)</i);
    const rankMatch = html.match(/<span class="profile__tier__division"[^>]*>([IViv]+)<\/span>/i);
    const lpMatch = html.match(/(\d+)\s*LP/i);

    if (!tierMatch || !lpMatch) return null;

    const tier = tierMatch[1].trim().toUpperCase();
    const rank = rankMatch ? rankMatch[1].toUpperCase() : "";
    const lp = parseInt(lpMatch[1]);

    return { tier, rank, lp };
  } catch (error) {
    console.error("Failed to fetch LP from lolchess:", error);
    return null;
  }
}

/**
 * Convert tier/rank to total LP for comparison
 */
function tierToTotalLP(tier: string, rank: string, lp: number): number {
  const tierValues: Record<string, number> = {
    "IRON": 0,
    "BRONZE": 400,
    "SILVER": 800,
    "GOLD": 1200,
    "PLATINUM": 1600,
    "EMERALD": 2000,
    "DIAMOND": 2400,
    "MASTER": 2800,
    "GRANDMASTER": 3200,
    "CHALLENGER": 3600
  };

  const rankValues: Record<string, number> = {
    "IV": 0, "III": 100, "II": 200, "I": 300
  };

  const tierBase = tierValues[tier] || 0;
  const rankBase = (tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER") ? 0 : (rankValues[rank] || 0);

  return tierBase + rankBase + lp;
}

/**
 * Fetch recent matches and calculate LP changes
 */
async function updateLPHistory(history: LPHistoryData, matchCount: number): Promise<LPHistoryData> {
  const puuid = getCurrentPuuid();
  if (!puuid) {
    throw new Error("PUUID not initialized");
  }
  const apiBase = getCurrentRiotApiBase();
  const historyUrl = `${apiBase}/tft/match/v1/matches/by-puuid/${puuid}/ids?count=${matchCount}`;

  const response = await fetchWithErrorHandling(historyUrl);
  const matchIds = await response.json() as string[];

  // Get current LP
  const currentLP = await fetchCurrentLP();
  if (!currentLP) {
    return history;
  }

  // Check for new matches
  const existingMatchIds = new Set(history.entries.map(e => e.matchId));
  const newMatchIds = matchIds.filter(id => !existingMatchIds.has(id));

  if (newMatchIds.length === 0) {
    return history;
  }

  // Fetch details for new matches
  for (const matchId of newMatchIds.reverse()) {
    const matchUrl = `${apiBase}/tft/match/v1/matches/${matchId}`;
    const matchResponse = await fetchWithErrorHandling(matchUrl);
    const matchData = await matchResponse.json() as any;

    const player = matchData.info.participants.find((p: any) => p.puuid === puuid);
    if (!player) continue;

    // Get previous LP entry or use current as baseline
    const lastEntry = history.entries[history.entries.length - 1];
    const prevTotalLP = lastEntry
      ? tierToTotalLP(lastEntry.tier, lastEntry.rank, lastEntry.lpAfter)
      : tierToTotalLP(currentLP.tier, currentLP.rank, currentLP.lp);

    // Estimate LP change based on placement (rough estimate)
    const lpChangeEstimate = estimateLPChange(player.placement);

    const entry: LPEntry = {
      timestamp: matchData.info.game_datetime,
      matchId,
      placement: player.placement,
      lpBefore: lastEntry ? lastEntry.lpAfter : currentLP.lp,
      lpAfter: lastEntry ? lastEntry.lpAfter + lpChangeEstimate : currentLP.lp,
      lpChange: lpChangeEstimate,
      tier: currentLP.tier,
      rank: currentLP.rank
    };

    history.entries.push(entry);
  }

  // Correct the last entry with actual current LP
  if (history.entries.length > 0) {
    const lastEntry = history.entries[history.entries.length - 1];
    const actualLP = currentLP.lp;
    const diff = actualLP - lastEntry.lpAfter;

    // Adjust LP chain to match current reality
    if (Math.abs(diff) < 100) {
      lastEntry.lpAfter = actualLP;
      lastEntry.lpChange = actualLP - lastEntry.lpBefore;
    }
    lastEntry.tier = currentLP.tier;
    lastEntry.rank = currentLP.rank;
  }

  history.lastUpdated = Date.now();
  saveHistory(history);

  return history;
}

/**
 * Estimate LP change based on placement
 */
function estimateLPChange(placement: number): number {
  // Rough LP estimates (actual varies by MMR)
  const lpChanges: Record<number, number> = {
    1: 45,
    2: 35,
    3: 25,
    4: 15,
    5: -10,
    6: -20,
    7: -30,
    8: -40
  };
  return lpChanges[placement] || 0;
}

/**
 * Calculate LP progression stats
 */
function calculateStats(entries: LPEntry[]): any {
  if (entries.length === 0) {
    return { totalGames: 0 };
  }

  const recentEntries = entries.slice(-20);
  const totalLPChange = entries.reduce((sum, e) => sum + e.lpChange, 0);
  const recentLPChange = recentEntries.reduce((sum, e) => sum + e.lpChange, 0);

  const avgPlacement = entries.reduce((sum, e) => sum + e.placement, 0) / entries.length;
  const recentAvgPlacement = recentEntries.reduce((sum, e) => sum + e.placement, 0) / recentEntries.length;

  const wins = entries.filter(e => e.placement === 1).length;
  const top4 = entries.filter(e => e.placement <= 4).length;

  // Find best streak
  let currentStreak = 0;
  let bestStreak = 0;
  for (const entry of entries) {
    if (entry.lpChange > 0) {
      currentStreak++;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  // Find worst streak
  currentStreak = 0;
  let worstStreak = 0;
  for (const entry of entries) {
    if (entry.lpChange < 0) {
      currentStreak++;
      worstStreak = Math.max(worstStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return {
    totalGames: entries.length,
    totalLPChange,
    recentGames: recentEntries.length,
    recentLPChange,
    avgPlacement: Math.round(avgPlacement * 100) / 100,
    recentAvgPlacement: Math.round(recentAvgPlacement * 100) / 100,
    winRate: `${Math.round((wins / entries.length) * 100)}%`,
    top4Rate: `${Math.round((top4 / entries.length) * 100)}%`,
    bestWinStreak: bestStreak,
    worstLoseStreak: worstStreak
  };
}

/**
 * Handler for tft_lp_history tool
 */
export async function handleTftLPHistory(params: { action?: "view" | "update" | "reset"; matchCount?: number }) {
  const { action = "view", matchCount = 10 } = params;
  const args = getArgs();
  const puuid = getCurrentPuuid();

  if (!puuid) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "PUUID not initialized" }, null, 2) }],
      isError: true
    };
  }

  try {
    // Load or create history
    let history: LPHistoryData = loadHistory() || {
      puuid,
      gameName: args.gameName,
      entries: [],
      lastUpdated: Date.now()
    };

    if (action === "reset") {
      history = {
        puuid,
        gameName: args.gameName,
        entries: [],
        lastUpdated: Date.now()
      };
    }

    if (action === "update" || (action === "view" && history.entries.length === 0)) {
      history = await updateLPHistory(history, matchCount);
      saveHistory(history);
    }

    // Get current LP
    const currentLP = await fetchCurrentLP();

    // Calculate stats
    const stats = calculateStats(history.entries);

    // Format recent games
    const recentGames = history.entries.slice(-10).reverse().map(e => ({
      date: new Date(e.timestamp).toLocaleDateString(),
      matchId: e.matchId,
      placement: e.placement,
      lpChange: e.lpChange > 0 ? `+${e.lpChange}` : `${e.lpChange}`,
      lp: e.lpAfter
    }));

    const result = {
      player: `${args.gameName}#${args.tagLine}`,
      currentRank: currentLP ? `${currentLP.tier} ${currentLP.rank} ${currentLP.lp} LP` : "Unknown",
      stats,
      recentGames,
      historyFile: getHistoryFilePath(),
      lastUpdated: new Date(history.lastUpdated).toLocaleString()
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
