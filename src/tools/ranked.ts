import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { getArgs } from "../types.js";

interface RankedStats {
  tier: string;
  rank: string;
  lp: number;
  wins: number;
  losses: number;
  top4Rate: string;
}

async function scrapeRankedFromLolchess(gameName: string, tagLine: string, region: string): Promise<RankedStats | null> {
  try {
    // Map region to lolchess format
    const regionMap: Record<string, string> = {
      euw1: "euw", eun1: "eune", na1: "na", kr: "kr",
      jp1: "jp", oc1: "oce", br1: "br", tr1: "tr",
      ru: "ru", la1: "lan", la2: "las", ph2: "ph",
      sg2: "sg", th2: "th", tw2: "tw", vn2: "vn"
    };
    const lolchessRegion = regionMap[region] || "euw";

    const url = `https://lolchess.gg/profile/${lolchessRegion}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
    console.error(`Fetching ranked from: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!response.ok) {
      console.error(`Lolchess returned ${response.status}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try multiple selectors for lolchess.gg (structure changes frequently)
    let tierText = "";
    let lpText = "";
    let winsText = "";

    // New lolchess structure (2025+)
    tierText = $(".tier strong").first().text().trim() ||
               $(".rank .desc .tier strong").first().text().trim() ||
               $("[class*='tier'] strong").first().text().trim();

    const rankSubText = $(".tier span").first().text().trim() ||
                        $(".rank .desc .tier span").first().text().trim() ||
                        $("[class*='tier'] span").first().text().trim();

    // Combine tier and rank subtext
    if (tierText && rankSubText) {
      tierText = `${tierText} ${rankSubText}`;
    }

    // LP from ratings section
    lpText = $(".ratings li .labels strong").first().text().trim() ||
             $("[class*='rating'] strong").first().text().trim();

    // Wins from page content
    winsText = $(".ratings li:contains('Win') .labels strong").text().trim() ||
               html.match(/(\d+)\s*(?:Wins?|W)/i)?.[1] || "0";

    // Also try to get games played
    const gamesText = $(".ratings li:contains('Played') .labels strong").text().trim() ||
                      html.match(/(\d+)\s*(?:Games?|Played)/i)?.[1] || "";

    if (!tierText) {
      // Try to extract from page text as fallback
      const pageText = $("body").text();
      const tierFallback = pageText.match(/(Iron|Bronze|Silver|Gold|Platinum|Emerald|Diamond|Master|Grandmaster|Challenger)\s*(IV|III|II|I)?/i);
      if (tierFallback) {
        tierText = tierFallback[0];
      }
    }

    if (!tierText) {
      console.error("Could not find tier on lolchess");
      return null;
    }

    // Parse tier and rank (e.g., "Diamond II" or "Diamond 2")
    const tierMatch = tierText.match(/(Iron|Bronze|Silver|Gold|Platinum|Emerald|Diamond|Master|Grandmaster|Challenger)\s*(IV|III|II|I|4|3|2|1)?/i);
    if (!tierMatch) {
      return null;
    }

    const tier = tierMatch[1].toUpperCase();
    let rank = tierMatch[2] || "";
    // Convert numeric rank to roman numerals
    if (rank === "1") rank = "I";
    else if (rank === "2") rank = "II";
    else if (rank === "3") rank = "III";
    else if (rank === "4") rank = "IV";

    // Parse LP
    const lpMatch = lpText.match(/(\d+)/);
    const lp = lpMatch ? parseInt(lpMatch[1], 10) : 0;

    // Parse wins
    const winsMatch = winsText.match(/(\d+)/);
    const wins = winsMatch ? parseInt(winsMatch[1], 10) : 0;

    // Parse games played
    const gamesMatch = gamesText.match(/(\d+)/);
    const totalGames = gamesMatch ? parseInt(gamesMatch[1], 10) : wins * 2;
    const losses = Math.max(0, totalGames - wins);

    // Calculate top4 rate
    const top4Rate = totalGames > 0 ? `${((wins / totalGames) * 100).toFixed(1)}%` : "N/A";

    return {
      tier,
      rank,
      lp,
      wins,
      losses,
      top4Rate
    };
  } catch (error) {
    console.error("Failed to scrape lolchess:", error);
    return null;
  }
}

export async function handleTftRankedStats() {
  const args = getArgs();

  try {
    // Try to scrape from lolchess.gg
    const rankedData = await scrapeRankedFromLolchess(
      args.gameName,
      args.tagLine,
      args.platform
    );

    if (!rankedData) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              player: `${args.gameName}#${args.tagLine}`,
              ranked: null,
              message: "Could not fetch ranked data. Riot API deprecated summoner ID endpoints. Try visiting lolchess.gg directly.",
              note: "The Riot API no longer provides summoner IDs needed for ranked stats. A future update may restore this functionality."
            }, null, 2)
          }
        ],
        isError: false
      };
    }

    const totalGames = rankedData.wins + rankedData.losses;

    const result = {
      player: `${args.gameName}#${args.tagLine}`,
      platform: args.platform,
      source: "lolchess.gg",
      ranked: {
        tier: rankedData.tier,
        rank: rankedData.rank,
        lp: rankedData.lp,
        displayRank: `${rankedData.tier} ${rankedData.rank} ${rankedData.lp} LP`,
        wins: rankedData.wins,
        totalGames,
        top4Rate: rankedData.top4Rate
      }
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ],
      isError: false
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            note: "Riot API deprecated summoner ID endpoints. Consider visiting lolchess.gg directly."
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}
