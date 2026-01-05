#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { REGION_MAPPING, PLATFORM_MAPPING, VALID_REGIONS, type Region, type Platform } from "./constants.js";
import { initializeDataDragon } from "./datadragon.js";
import { TFT_TOOLS } from "./tools/index.js";
import { handleTftMatchDetails, handleTftMatchHistory, handleTftMatchSummary } from "./tools/match.js";
import { handleTftMatchTracker } from "./tools/tracker.js";
import { handleTftCoaching } from "./tools/coaching.js";
import { handleTftRankedStats } from "./tools/ranked.js";
import {
  handleTftMetaComps,
  handleTftMetaAugments,
  handleTftMetaUnits,
  handleTftMetaItems,
  handleTftMetaTraits,
  handleTftUnitBuilds,
  handleTftCurrentPatch
} from "./tools/meta.js";
import { setArgs, type Arguments } from "./types.js";
import { initializePUUID } from "./utils.js";

// Détecte la région à partir du tagLine si non spécifiée
function detectRegion(tagLine: string, explicitRegion?: string): Region | null {
  if (explicitRegion && VALID_REGIONS.includes(explicitRegion as Region)) {
    return explicitRegion as Region;
  }
  const tagLower = tagLine.toLowerCase();
  if (REGION_MAPPING[tagLower]) {
    return REGION_MAPPING[tagLower];
  }
  return null;
}

// Détecte la plateforme à partir du tagLine
function detectPlatform(tagLine: string): Platform {
  const tagLower = tagLine.toLowerCase();
  return PLATFORM_MAPPING[tagLower] || "euw1"; // Default EUW
}

const getArgs = async (): Promise<Arguments> => {
  const parsed = await yargs(hideBin(process.argv))
    .option("apiKey", {
      alias: "k",
      type: "string",
      description: "Riot API Key",
      demandOption: true
    })
    .option("gameName", {
      alias: "n",
      type: "string",
      description: "Summoner Name",
      demandOption: true
    })
    .option("tagLine", {
      alias: "t",
      type: "string",
      description: "Name Tagline (ex: EUW, NA1, KR, or custom)",
      demandOption: true
    })
    .option("region", {
      alias: "r",
      type: "string",
      description: "API Region (americas, europe, asia, sea). Required if tagLine is custom.",
      choices: VALID_REGIONS
    })
    .help()
    .parseAsync();

  const detectedRegion = detectRegion(parsed.tagLine, parsed.region);

  if (!detectedRegion) {
    console.error(`⚠️  Warning: TagLine "${parsed.tagLine}" is not a recognized region.`);
    console.error(`   Known taglines: ${Object.keys(REGION_MAPPING).join(", ")}`);
    console.error(`   Please specify --region (americas, europe, asia, sea)`);
    console.error("");
    console.error(`   Example: --region europe`);
    process.exit(1);
  }

  // Warning si tagLine custom mais région explicite fournie
  const tagLower = parsed.tagLine.toLowerCase();
  if (!REGION_MAPPING[tagLower] && parsed.region) {
    console.error(`ℹ️  Using explicit region "${parsed.region}" (tagLine "${parsed.tagLine}" is custom)`);
  }

  return {
    ...parsed,
    region: detectedRegion,
    platform: detectPlatform(parsed.tagLine)
  };
};

// Server setup
const server = new Server(
  {
    name: "tft",
    version: "0.1.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TFT_TOOLS
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "tft_match_history": {
        return await handleTftMatchHistory(request.params.arguments);
      }
      case "tft_match_details": {
        return await handleTftMatchDetails(request.params.arguments);
      }
      case "tft_match_summary": {
        return await handleTftMatchSummary(request.params.arguments);
      }
      case "tft_ranked_stats": {
        return await handleTftRankedStats();
      }
      case "tft_meta_comps": {
        return await handleTftMetaComps();
      }
      case "tft_meta_augments": {
        return await handleTftMetaAugments();
      }
      case "tft_meta_units": {
        return await handleTftMetaUnits(request.params.arguments as { rank?: string });
      }
      case "tft_meta_items": {
        return await handleTftMetaItems(request.params.arguments as { rank?: string });
      }
      case "tft_meta_traits": {
        return await handleTftMetaTraits(request.params.arguments as { rank?: string });
      }
      case "tft_unit_builds": {
        return await handleTftUnitBuilds();
      }
      case "tft_current_patch": {
        return await handleTftCurrentPatch();
      }
      case "tft_match_tracker": {
        return await handleTftMatchTracker(request.params.arguments as { matchId: string; mode?: "summary" | "complete" });
      }
      case "tft_coaching": {
        return await handleTftCoaching(request.params.arguments as { matchCount?: number });
      }
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`
        }
      ],
      isError: true
    };
  }
});

// Modify runServer to initialize args and PUUID first
async function runServer() {
  const parsedArgs = await getArgs();
  setArgs(parsedArgs);
  await Promise.all([
    initializePUUID(),
    initializeDataDragon()
  ]);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TFT MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
