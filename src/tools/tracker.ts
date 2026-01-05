import fetch from "node-fetch";
import { gunzipSync } from "zlib";
import { getArgs } from "../types.js";
import { getChampionName, getItemName } from "../datadragon.js";

const METATFT_API = "https://api.metatft.com";
const METATFT_S3 = "https://metatft-matches-2.ams3.digitaloceanspaces.com";

interface AppMatch {
  uuid: string;
  match_id_ow: string;
  player_id: number;
  created_timestamp: number;
  match_data_url: string;
}

interface ProfileResponse {
  app_matches?: AppMatch[];
  summoner?: {
    id: number;
    puuid: string;
  };
}

interface BoardPiece {
  name: string;
  level: string;
  item_1?: string;
  item_2?: string;
  item_3?: string;
}

/**
 * Extract items from a board piece (item_1, item_2, item_3 format)
 */
function extractItems(piece: BoardPiece): string[] {
  const items: string[] = [];
  if (piece.item_1) items.push(piece.item_1);
  if (piece.item_2) items.push(piece.item_2);
  if (piece.item_3) items.push(piece.item_3);
  return items;
}

interface UnitDamage {
  name: string;
  damage: number;
  level: number;
}

interface RoundType {
  stage: string;
  name: string;
  type: string; // PVE or PVP
  native_name?: string;
}

interface TrackerStage {
  board?: {
    board_pieces?: Record<string, BoardPiece>;
  };
  bench?: {
    bench_pieces?: Record<string, BoardPiece>;
  };
  me?: {
    health: string;
    gold: string;
    xp?: { level: number; current_xp: number; xp_max: number };
    rank?: string;
    summoner_name?: string;
  };
  roster?: {
    player_status?: Record<string, {
      health: number;
      xp: number;
      rank: number;
      tag_line: string;
    }>;
  };
  match_info?: {
    round_type?: RoundType;
    round_outcome?: Record<string, { outcome: string; tag_line: string }>;
    opponent?: { name: string; tag_line: string };
    item_select?: any;
  };
  local_player_damage?: {
    units?: Record<string, UnitDamage>;
    time?: number;
  };
  augments?: Record<string, any> | string[];
  // Economy & actions
  gold_earned?: number;
  rerolls?: number;
  repositions?: number;
  // Metrics
  metrics?: {
    board_strength?: number;
    board_cost?: number;
    bench_cost?: number;
    num_completed_items?: number;
  };
  // Shop
  shops?: Array<{
    shop_pieces?: Record<string, { name: string }>;
  }>;
}

interface TrackerData {
  match_id: string;
  server: string;
  summoner_name: string;
  uuid: string;
  stage_data: string; // JSON string to parse
  // Additional top-level fields
  portal?: string;
  summoner_tier?: string;
  queue_id?: string;
  tft_set_core_name?: string;
  match_metrics?: {
    rerolls?: Array<{ level: number; rolls: number }>;
  };
}

/**
 * Fetch profile from MetaTFT to get app_matches mapping
 */
async function fetchMetaTFTProfile(): Promise<ProfileResponse> {
  const args = getArgs();
  const platform = args.platform.toUpperCase().replace("1", "1"); // euw1 -> EUW1
  const url = `${METATFT_API}/public/profile/lookup_by_riotid/${platform}/${encodeURIComponent(args.gameName)}/${encodeURIComponent(args.tagLine)}?source=full_profile&tft_set=TFTSet16`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "TFT-MCP-Server/1.0",
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`MetaTFT API error: ${response.status}`);
  }

  return response.json() as Promise<ProfileResponse>;
}

/**
 * Fetch and decompress tracker data from S3
 */
async function fetchTrackerData(uuid: string): Promise<TrackerData> {
  const url = `${METATFT_S3}/${uuid}.json`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "TFT-MCP-Server/1.0",
      "Accept-Encoding": "gzip"
    }
  });

  if (!response.ok) {
    throw new Error(`S3 fetch error: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Try to decompress if gzipped
  let jsonStr: string;
  try {
    const decompressed = gunzipSync(buffer);
    jsonStr = decompressed.toString("utf-8");
  } catch {
    // Not gzipped, use as-is
    jsonStr = buffer.toString("utf-8");
  }

  return JSON.parse(jsonStr) as TrackerData;
}

/**
 * Format stage data for readable output
 */
function formatStageData(stages: TrackerStage[], stageIndex: number): any {
  const stage = stages[stageIndex];
  if (!stage) return null;

  const formatted: any = {
    stageNumber: stageIndex + 1
  };

  // Stage/round info from round_type
  if (stage.match_info?.round_type) {
    formatted.stage = stage.match_info.round_type.stage;
    formatted.roundType = stage.match_info.round_type.type; // PVE or PVP
    formatted.roundName = stage.match_info.round_type.name;
  }

  // Opponent info
  if (stage.match_info?.opponent) {
    formatted.opponent = `${stage.match_info.opponent.name}#${stage.match_info.opponent.tag_line}`;
  }

  // Player stats
  if (stage.me) {
    formatted.player = {
      health: parseInt(stage.me.health) || 0,
      gold: parseInt(stage.me.gold) || 0,
      level: stage.me.xp?.level || 0
    };
  }

  // Economy info
  if (stage.gold_earned !== undefined) {
    formatted.goldEarned = stage.gold_earned;
  }
  if (stage.rerolls !== undefined) {
    formatted.rerolls = stage.rerolls;
  }

  // Board units
  if (stage.board?.board_pieces) {
    const pieces = Object.values(stage.board.board_pieces);
    if (pieces.length > 0) {
      formatted.board = pieces.map(u => ({
        champion: getChampionName(u.name),
        stars: parseInt(u.level) || 1,
        items: extractItems(u).map(i => getItemName(i))
      }));
    }
  }

  // Bench units
  if (stage.bench?.bench_pieces) {
    const pieces = Object.values(stage.bench.bench_pieces);
    if (pieces.length > 0) {
      formatted.bench = pieces.map(u => ({
        champion: getChampionName(u.name),
        stars: parseInt(u.level) || 1
      }));
    }
  }

  // Unit damage (MVP tracking!)
  if (stage.local_player_damage?.units) {
    const units = Object.values(stage.local_player_damage.units)
      .filter(u => u.damage && u.damage > 0)
      .sort((a, b) => (b.damage || 0) - (a.damage || 0));
    if (units.length > 0) {
      formatted.unitDamage = units.map(u => ({
        champion: getChampionName(u.name),
        damage: u.damage,
        stars: u.level
      }));
    }
  }

  // All players HP
  if (stage.roster?.player_status) {
    formatted.allPlayers = Object.entries(stage.roster.player_status)
      .map(([name, data]) => ({
        name: data.tag_line ? `${name}#${data.tag_line}` : name,
        health: data.health,
        level: data.xp
      }))
      .sort((a, b) => b.health - a.health);
  }

  // Shop contents
  if (stage.shops && stage.shops.length > 0) {
    const lastShop = stage.shops[stage.shops.length - 1];
    if (lastShop?.shop_pieces) {
      formatted.shop = Object.values(lastShop.shop_pieces)
        .map(s => getChampionName(s.name));
    }
  }

  // Metrics
  if (stage.metrics) {
    formatted.metrics = {
      boardStrength: stage.metrics.board_strength,
      boardCost: stage.metrics.board_cost,
      benchCost: stage.metrics.bench_cost
    };
  }

  return formatted;
}

/**
 * Format all stages summary with economy tracking
 */
function formatAllStages(stages: TrackerStage[]): any[] {
  return stages.map((stage, idx) => {
    const summary: any = {
      round: idx + 1
    };

    // Stage info
    if (stage.match_info?.round_type) {
      summary.stage = stage.match_info.round_type.stage;
      summary.type = stage.match_info.round_type.type;
    }

    if (stage.me) {
      summary.hp = parseInt(stage.me.health) || 0;
      summary.gold = parseInt(stage.me.gold) || 0;
      summary.level = stage.me.xp?.level || 0;
    }

    if (stage.board?.board_pieces) {
      summary.boardSize = Object.keys(stage.board.board_pieces).length;
    }

    // Economy
    if (stage.gold_earned !== undefined) {
      summary.income = stage.gold_earned;
    }
    if (stage.rerolls !== undefined && stage.rerolls > 0) {
      summary.rerolls = stage.rerolls;
    }

    // Round outcome for player
    if (stage.match_info?.round_outcome) {
      const gameName = getArgs().gameName.toLowerCase();
      const myOutcome = Object.entries(stage.match_info.round_outcome)
        .find(([name]) => name.toLowerCase().includes(gameName));
      if (myOutcome) {
        summary.outcome = myOutcome[1].outcome;
      }
    }

    return summary;
  });
}

/**
 * Find key decision points: augment rounds + late game
 * 2-1 (augment 1), 3-2 (augment 2), 4-2 (augment 3), 5-1 (late), 6-1 (end), final
 */
function findKeyProgressionStages(stages: TrackerStage[]): number[] {
  const keyRounds = ["2-1", "3-2", "4-2", "5-1", "6-1"];
  const keyIndices: number[] = [];
  const found = new Set<string>();

  for (let i = 0; i < stages.length; i++) {
    const stageInfo = stages[i].match_info?.round_type?.stage;
    if (stageInfo && keyRounds.includes(stageInfo) && !found.has(stageInfo)) {
      keyIndices.push(i);
      found.add(stageInfo);
    }
  }

  // Always include last stage
  if (keyIndices.length === 0 || keyIndices[keyIndices.length - 1] !== stages.length - 1) {
    keyIndices.push(stages.length - 1);
  }

  return keyIndices;
}

/**
 * Calculate carry damage stats across all stages
 */
function calculateCarryStats(stages: TrackerStage[]): any[] {
  const damageByUnit: Record<string, { total: number; count: number; maxStars: number }> = {};

  for (const stage of stages) {
    if (stage.local_player_damage?.units) {
      for (const unit of Object.values(stage.local_player_damage.units)) {
        if (unit.damage && unit.damage > 0) {
          const name = getChampionName(unit.name);
          if (!damageByUnit[name]) {
            damageByUnit[name] = { total: 0, count: 0, maxStars: 0 };
          }
          damageByUnit[name].total += unit.damage;
          damageByUnit[name].count++;
          damageByUnit[name].maxStars = Math.max(damageByUnit[name].maxStars, unit.level);
        }
      }
    }
  }

  return Object.entries(damageByUnit)
    .map(([name, stats]) => ({
      champion: name,
      totalDamage: stats.total,
      avgDamage: Math.round(stats.total / stats.count),
      roundsPlayed: stats.count,
      maxStars: stats.maxStars
    }))
    .sort((a, b) => b.totalDamage - a.totalDamage);
}

/**
 * Handler for tft_match_tracker tool
 */
export async function handleTftMatchTracker(params: { matchId: string; mode?: "summary" | "complete" }) {
  const { matchId, mode = "summary" } = params;

  try {
    // Extract match number from ID (remove region prefix)
    const matchNumber = matchId.replace(/^[A-Z]+\d*_/, "");

    // Fetch profile to get app_matches
    const profile = await fetchMetaTFTProfile();

    if (!profile.app_matches || profile.app_matches.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "No tracker data available. The MetaTFT tracker was not active during any recent games.",
            tip: "Tracker data is only available for games played with the MetaTFT overlay/tracker running."
          }, null, 2)
        }],
        isError: true
      };
    }

    // Find matching app_match
    const appMatch = profile.app_matches.find(m => m.match_id_ow === matchNumber);

    if (!appMatch) {
      // List available matches with tracker data
      const availableMatches = profile.app_matches.map(m => ({
        matchId: m.match_id_ow,
        date: new Date(m.created_timestamp).toLocaleString()
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `No tracker data for match ${matchId}`,
            reason: "The MetaTFT tracker was not active during this game.",
            availableMatches: availableMatches.slice(0, 10)
          }, null, 2)
        }],
        isError: true
      };
    }

    // Fetch tracker data from S3
    const trackerData = await fetchTrackerData(appMatch.uuid);

    // Parse stage_data
    let stages: TrackerStage[] = [];
    try {
      stages = JSON.parse(trackerData.stage_data);
    } catch {
      // stage_data might already be parsed
      stages = trackerData.stage_data as unknown as TrackerStage[];
    }

    // Build HP progression
    const hpProgression = formatAllStages(stages);

    // Build summary
    const firstStage = stages[0];
    const lastStage = stages[stages.length - 1];

    // Get final board
    const finalBoard = lastStage?.board?.board_pieces
      ? Object.values(lastStage.board.board_pieces).map(u => ({
          champion: getChampionName(u.name),
          stars: parseInt(u.level) || 1,
          items: extractItems(u).map(i => getItemName(i))
        }))
      : [];

    // Calculate economy stats
    let totalRerolls = 0;
    let totalIncome = 0;
    for (const stage of stages) {
      if (stage.rerolls) totalRerolls += stage.rerolls;
      if (stage.gold_earned) totalIncome += stage.gold_earned;
    }

    // Calculate carry stats
    const carryStats = calculateCarryStats(stages);

    // Build stage progression based on mode
    let stageProgression: any[];
    if (mode === "complete") {
      // All rounds with full detail
      stageProgression = stages.map((_, idx) => formatStageData(stages, idx));
    } else {
      // Summary mode: key decision points only
      const keyIndices = findKeyProgressionStages(stages);
      stageProgression = keyIndices.map(idx => formatStageData(stages, idx));
    }

    const result: any = {
      matchId: matchId,
      trackerUuid: appMatch.uuid,
      server: trackerData.server,
      summonerName: trackerData.summoner_name,
      mode,
      // Match context
      portal: trackerData.portal,
      rank: trackerData.summoner_tier,
      set: trackerData.tft_set_core_name,
      totalRounds: stages.length,
      // Summary
      summary: {
        startingHealth: parseInt(firstStage?.me?.health || "100"),
        finalHealth: parseInt(lastStage?.me?.health || "0"),
        finalGold: parseInt(lastStage?.me?.gold || "0"),
        totalRerolls,
        totalIncome
      },
      // Carry performance (top 5)
      topCarries: carryStats.slice(0, 5),
      // Final board with items
      finalBoard,
      // Detailed stages
      stageProgression
    };

    // Only include compact roundProgression in summary mode
    if (mode === "summary") {
      result.roundProgression = hpProgression;
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }],
      isError: false
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error)
        }, null, 2)
      }],
      isError: true
    };
  }
}
