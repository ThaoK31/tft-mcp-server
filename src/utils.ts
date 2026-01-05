import fetch from "node-fetch";
import { getRiotAccountApi, getRiotApiBase, getPlatformApiBase } from "./constants.js";
import { getArgs } from "./types.js";

let _currentPuuid: string | null = null;

export function getCurrentPuuid(): string | null {
  return _currentPuuid;
}

// Kept for backward compatibility but prefer getCurrentPuuid()
export { _currentPuuid as CURRENT_PUUID };

export async function fetchWithErrorHandling(url: string, options: any = {}) {
  try {
    const headers = {
      "X-Riot-Token": getArgs().apiKey,
      ...options.headers
    };

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const body = await response.text();
      console.error(`API Error: ${response.status} - ${body}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
  } catch (error) {
    throw new Error(
      `Failed to fetch: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export function getCurrentRiotApiBase(): string {
  return getRiotApiBase(getArgs().region);
}

export function getCurrentPlatformApiBase(): string {
  return getPlatformApiBase(getArgs().platform);
}

export async function initializePUUID() {
  try {
    const args = getArgs();
    const accountApi = getRiotAccountApi(args.region);
    const url = `${accountApi}/accounts/by-riot-id/${encodeURIComponent(
      args.gameName
    )}/${encodeURIComponent(args.tagLine)}`;
    const response = await fetchWithErrorHandling(url);
    const data = (await response.json()) as { puuid: string };
    _currentPuuid = data.puuid;
    console.error(`Initialized PUUID for ${args.gameName}#${args.tagLine} on region: ${args.region}`);
  } catch (error) {
    console.error("Failed to initialize PUUID:", error);
    process.exit(1);
  }
}
