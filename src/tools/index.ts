import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// Define tools using the Zod schemas
export const TFT_TOOLS: Tool[] = [
  {
    name: "tft_match_history",
    description: "Get TFT match history for the current player",
    inputSchema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          default: 20,
          description: "Number of matches to retrieve (default: 20)"
        },
        start: {
          type: "number",
          default: 0,
          description: "Start index (default: 0)"
        }
      }
    }
  },
  {
    name: "tft_match_details",
    description: "Get detailed RAW information about a specific TFT match (use tft_match_summary for formatted data)",
    inputSchema: {
      type: "object",
      properties: {
        matchId: {
          type: "string",
          description: "The match ID to get details for"
        }
      },
      required: ["matchId"]
    }
  },
  {
    name: "tft_match_summary",
    description: "Get a formatted summary of a TFT match with readable champion/item names, placements, and compositions",
    inputSchema: {
      type: "object",
      properties: {
        matchId: {
          type: "string",
          description: "The match ID to get summary for"
        }
      },
      required: ["matchId"]
    }
  },
  {
    name: "tft_ranked_stats",
    description: "Get ranked stats for the current player (rank, LP, winrate, games played)",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "tft_meta_comps",
    description: "Get current meta compositions from MetaTFT with tier ratings, winrates, and recommended units",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "tft_meta_augments",
    description: "Get current meta augments from MetaTFT with tier ratings and performance stats",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "tft_meta_units",
    description: "Get stats for all TFT champions/units (avg placement, win rate, top4 rate, pick rate)",
    inputSchema: {
      type: "object",
      properties: {
        rank: {
          type: "string",
          description: "Rank filter (default: DIAMOND,MASTER,GRANDMASTER,CHALLENGER)",
          default: "DIAMOND,MASTER,GRANDMASTER,CHALLENGER"
        }
      }
    }
  },
  {
    name: "tft_meta_items",
    description: "Get stats for all TFT items (avg placement, win rate, top4 rate)",
    inputSchema: {
      type: "object",
      properties: {
        rank: {
          type: "string",
          description: "Rank filter (default: DIAMOND,MASTER,GRANDMASTER,CHALLENGER)",
          default: "DIAMOND,MASTER,GRANDMASTER,CHALLENGER"
        }
      }
    }
  },
  {
    name: "tft_meta_traits",
    description: "Get stats for all TFT traits by level (e.g., Brawler 2, Brawler 4)",
    inputSchema: {
      type: "object",
      properties: {
        rank: {
          type: "string",
          description: "Rank filter (default: DIAMOND,MASTER,GRANDMASTER,CHALLENGER)",
          default: "DIAMOND,MASTER,GRANDMASTER,CHALLENGER"
        }
      }
    }
  },
  {
    name: "tft_unit_builds",
    description: "Get best-in-slot items for each TFT champion with pick rates and avg placement",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "tft_current_patch",
    description: "Get current TFT patch info and total games analyzed",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "tft_match_tracker",
    description: "Get round-by-round tracker data for a match (HP, gold, board, bench per stage). Only available for games played with MetaTFT tracker active.",
    inputSchema: {
      type: "object",
      properties: {
        matchId: {
          type: "string",
          description: "The match ID to get tracker data for (e.g., EUW1_7671240308)"
        },
        mode: {
          type: "string",
          enum: ["summary", "complete"],
          default: "summary",
          description: "summary = key stages only (2-1, 3-2, 4-2, 5-1, 6-1, final), complete = all rounds with full detail"
        }
      },
      required: ["matchId"]
    }
  },
  {
    name: "tft_coaching",
    description: "Get personalized coaching recommendations based on recent match analysis. Compares your performance with meta data to identify strengths, weaknesses, and improvement opportunities.",
    inputSchema: {
      type: "object",
      properties: {
        matchCount: {
          type: "number",
          default: 10,
          description: "Number of recent matches to analyze (default: 10, max: 20)"
        }
      }
    }
  },
  {
    name: "tft_lp_history",
    description: "Track LP progression over time. Stores match results and LP changes locally for historical analysis.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["view", "update", "reset"],
          default: "view",
          description: "view = show history, update = fetch new matches, reset = clear history"
        },
        matchCount: {
          type: "number",
          default: 10,
          description: "Number of recent matches to check for updates (default: 10)"
        }
      }
    }
  },
  {
    name: "tft_compare_players",
    description: "Compare your stats with another player. Shows side-by-side comparison of placements, win rates, most played units/traits, and playstyle differences.",
    inputSchema: {
      type: "object",
      properties: {
        gameName: {
          type: "string",
          description: "The other player's game name (e.g., 'PlayerName')"
        },
        tagLine: {
          type: "string",
          description: "The other player's tag line (e.g., 'EUW', 'NA1')"
        },
        matchCount: {
          type: "number",
          default: 10,
          description: "Number of recent matches to analyze for each player (default: 10)"
        }
      },
      required: ["gameName", "tagLine"]
    }
  }
];
