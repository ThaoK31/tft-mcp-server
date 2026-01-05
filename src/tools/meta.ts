import fetch from "node-fetch";

const METATFT_API_BASE = "https://api-hc.metatft.com";

interface MetaComp {
  name: string;
  tier: string;
  avgPlacement: string;
  winRate: string;
  top4Rate: string;
  playRate: string;
  units: string[];
}

interface MetaAugment {
  name: string;
  tier: string;
  avgPlacement: string;
  winRate: string;
  top4Rate: string;
  pickRate: string;
}

// Cache pour éviter trop de requêtes
let compsCache: MetaComp[] | null = null;
let augmentsCache: MetaAugment[] | null = null;
let compsCacheTime = 0;
let augmentsCacheTime = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

async function fetchMetaTFTCompsREST(): Promise<MetaComp[]> {
  // Vérifier le cache
  if (compsCache && Date.now() - compsCacheTime < CACHE_DURATION) {
    return compsCache;
  }

  try {
    const compsDataUrl = `${METATFT_API_BASE}/tft-comps-api/comps_data?queue=1100`;
    const compsStatsUrl = `${METATFT_API_BASE}/tft-comps-api/comps_stats?queue=1100&patch=current&days=3&rank=DIAMOND,MASTER,GRANDMASTER,CHALLENGER`;

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
      "Origin": "https://www.metatft.com",
      "Referer": "https://www.metatft.com/"
    };

    const [compsDataRes, compsStatsRes] = await Promise.all([
      fetch(compsDataUrl, { headers }),
      fetch(compsStatsUrl, { headers })
    ]);

    if (!compsDataRes.ok || !compsStatsRes.ok) {
      console.error(`MetaTFT API error: comps_data=${compsDataRes.status}, comps_stats=${compsStatsRes.status}`);
      return getDefaultComps();
    }

    const compsDataJson = await compsDataRes.json() as any;
    const compsStatsJson = await compsStatsRes.json() as any;

    // Structure: compsDataJson.results.data.cluster_details = { "381000": {...}, "381001": {...} }
    const clusterDetails = compsDataJson?.results?.data?.cluster_details || {};

    // Structure: compsStatsJson.results = [{ cluster: "381000", places: [...], count: N }, ...]
    const statsArray = compsStatsJson?.results || [];

    // Create stats lookup by cluster ID
    const statsMap: Record<string, any> = {};
    for (const stat of statsArray) {
      if (stat.cluster) {
        statsMap[stat.cluster] = stat;
      }
    }

    // Merge data
    const comps: MetaComp[] = [];
    let totalGames = 0;

    // Calculate total games for play rate
    for (const stat of statsArray) {
      if (stat.count) totalGames += stat.count;
    }

    for (const [clusterId, clusterData] of Object.entries(clusterDetails)) {
      const data = clusterData as any;
      const stats = statsMap[clusterId];

      if (!stats || !stats.places || stats.places.length < 9) continue;

      const places = stats.places;
      const count = stats.count || places[8] || 0;
      if (count === 0) continue;

      // Calculate rates from places array [1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, total]
      const winRate = (places[0] / count) * 100;
      const top4Rate = ((places[0] + places[1] + places[2] + places[3]) / count) * 100;
      const playRate = totalGames > 0 ? (count / totalGames) * 100 : 0;

      // Calculate avg placement
      let avgPlacement = 0;
      for (let i = 0; i < 8; i++) {
        avgPlacement += (i + 1) * places[i];
      }
      avgPlacement = avgPlacement / count;

      // Get name from name_string or units_string
      let name = data.name_string || "";
      if (!name && data.units_string) {
        // Use first two units as name
        const units = data.units_string.split(",").slice(0, 2).map((u: string) =>
          u.trim().replace(/^TFT\d+_/, "")
        );
        name = units.join(" + ");
      }

      // Parse units
      const units = (data.units_string || "")
        .split(",")
        .map((u: string) => u.trim().replace(/^TFT\d+_/, ""))
        .filter((u: string) => u && u !== "");

      // Determine tier based on avg placement (thresholds from MetaTFT website)
      let tier = "D";
      if (avgPlacement <= 4.24) tier = "S";
      else if (avgPlacement <= 4.51) tier = "A";
      else if (avgPlacement <= 4.74) tier = "B";
      else if (avgPlacement <= 4.99) tier = "C";

      comps.push({
        name: name.replace(/TFT\d+_/g, "").replace(/,/g, " +") || `Comp ${clusterId}`,
        tier,
        avgPlacement: avgPlacement.toFixed(2),
        winRate: `${winRate.toFixed(1)}%`,
        top4Rate: `${top4Rate.toFixed(1)}%`,
        playRate: `${playRate.toFixed(2)}%`,
        units
      });
    }

    // Sort by avg placement (best first)
    comps.sort((a, b) => parseFloat(a.avgPlacement) - parseFloat(b.avgPlacement));

    // Take top 15
    const topComps = comps.slice(0, 15);

    if (topComps.length === 0) {
      console.error("No comps parsed from MetaTFT response");
      return getDefaultComps();
    }

    compsCache = topComps;
    compsCacheTime = Date.now();
    return topComps;
  } catch (error) {
    console.error("Failed to fetch MetaTFT comps:", error);
    return getDefaultComps();
  }
}

async function fetchMetaTFTAugmentsREST(): Promise<MetaAugment[]> {
  // Vérifier le cache
  if (augmentsCache && Date.now() - augmentsCacheTime < CACHE_DURATION) {
    return augmentsCache;
  }

  try {
    // MetaTFT only provides a tier list for augments, no stats endpoint
    const augmentsUrl = `${METATFT_API_BASE}/tft-stat-api/augments_tiers`;

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
      "Origin": "https://www.metatft.com",
      "Referer": "https://www.metatft.com/"
    };

    const response = await fetch(augmentsUrl, { headers });

    if (!response.ok) {
      console.error(`MetaTFT augments API returned ${response.status}`);
      return getDefaultAugments();
    }

    const json = await response.json() as any;
    const augments: MetaAugment[] = [];

    // Structure: { content: { content: { tierList: [{ label: "S", content: [...] }, ...] } } }
    const tierList = json?.content?.content?.tierList || [];

    for (const tierGroup of tierList) {
      const tier = tierGroup.label || "?";
      const augmentsList = tierGroup.content || [];

      for (const aug of augmentsList) {
        if (!aug.id) continue;

        // Clean up augment name from ID
        const name = aug.id
          .replace(/^TFT\d+_Augment_/, "")
          .replace(/^TFT_Augment_/, "")
          .replace(/_/g, " ")           // Replace underscores with spaces
          .replace(/(\d+)$/, " $1")     // Add space before trailing numbers
          .replace(/([a-z])([A-Z])/g, "$1 $2") // CamelCase to spaces
          .replace(/Plus Plus/g, "++")  // PlusPlus -> ++
          .replace(/Plus/g, "+")        // Plus -> +
          .replace(/Minus/g, "-")       // Minus -> -
          .trim()
          .replace(/\s+/g, " ");

        augments.push({
          name,
          tier,
          avgPlacement: "-", // Tier list doesn't include stats
          winRate: "-",
          top4Rate: "-",
          pickRate: "-"
        });
      }
    }

    // Take top augments (S and A tiers first, limited to 25)
    const topAugments = augments.slice(0, 25);

    if (topAugments.length === 0) {
      console.error("No augments parsed from MetaTFT response");
      return getDefaultAugments();
    }

    augmentsCache = topAugments;
    augmentsCacheTime = Date.now();
    return topAugments;
  } catch (error) {
    console.error("Failed to fetch MetaTFT augments:", error);
    return getDefaultAugments();
  }
}

// Données par défaut si API échoue
function getDefaultComps(): MetaComp[] {
  return [
    {
      name: "API unavailable - visit metatft.com",
      tier: "Info",
      avgPlacement: "-",
      winRate: "-",
      top4Rate: "-",
      playRate: "-",
      units: []
    }
  ];
}

function getDefaultAugments(): MetaAugment[] {
  return [
    {
      name: "API unavailable - visit metatft.com/augments",
      tier: "Info",
      avgPlacement: "-",
      winRate: "-",
      top4Rate: "-",
      pickRate: "-"
    }
  ];
}

export async function handleTftMetaComps() {
  try {
    const comps = await fetchMetaTFTCompsREST();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            source: "MetaTFT",
            apiBase: METATFT_API_BASE,
            lastUpdated: new Date().toISOString(),
            compsCount: comps.length,
            comps
          }, null, 2)
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
            suggestion: "Visit metatft.com directly for current meta data"
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}

export async function handleTftMetaAugments() {
  try {
    const augments = await fetchMetaTFTAugmentsREST();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            source: "MetaTFT",
            apiBase: METATFT_API_BASE,
            lastUpdated: new Date().toISOString(),
            augmentsCount: augments.length,
            augments
          }, null, 2)
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
            suggestion: "Visit metatft.com/augments directly for current meta data"
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}

// ============== NEW TOOLS ==============

const DEFAULT_RANK = "DIAMOND,MASTER,GRANDMASTER,CHALLENGER";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json",
  "Origin": "https://www.metatft.com",
  "Referer": "https://www.metatft.com/"
};

// Helper: Calculate stats from places array
function calcStats(places: number[]) {
  const total = places.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const winRate = (places[0] / total) * 100;
  const top4Rate = ((places[0] + places[1] + places[2] + places[3]) / total) * 100;
  let avgPlacement = 0;
  for (let i = 0; i < 8; i++) {
    avgPlacement += (i + 1) * places[i];
  }
  avgPlacement = avgPlacement / total;

  return {
    games: total,
    avgPlacement: avgPlacement.toFixed(2),
    winRate: `${winRate.toFixed(1)}%`,
    top4Rate: `${top4Rate.toFixed(1)}%`
  };
}

// Helper: Clean TFT ID to readable name
function cleanName(id: string): string {
  return id
    .replace(/^TFT\d+_/, "")
    .replace(/^TFT_Item_/, "")
    .replace(/_/g, " ");
}

// ============== tft_meta_units ==============
export async function handleTftMetaUnits(args?: { rank?: string }) {
  try {
    const rank = args?.rank || DEFAULT_RANK;
    const url = `${METATFT_API_BASE}/tft-stat-api/units?queue=1100&patch=current&days=3&rank=${rank}`;

    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const json = await response.json() as any;
    const results = json?.results || [];

    const units = results
      .map((u: any) => {
        const stats = calcStats(u.places || []);
        if (!stats) return null;
        return {
          name: cleanName(u.unit || ""),
          ...stats
        };
      })
      .filter((u: any) => u !== null)
      .sort((a: any, b: any) => parseFloat(a.avgPlacement) - parseFloat(b.avgPlacement));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          source: "MetaTFT",
          endpoint: "/tft-stat-api/units",
          rank,
          lastUpdated: new Date().toISOString(),
          unitsCount: units.length,
          units
        }, null, 2)
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

// ============== tft_meta_items ==============
export async function handleTftMetaItems(args?: { rank?: string }) {
  try {
    const rank = args?.rank || DEFAULT_RANK;
    const url = `${METATFT_API_BASE}/tft-stat-api/items?queue=1100&patch=current&days=3&rank=${rank}`;

    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const json = await response.json() as any;
    const results = json?.results || [];

    const items = results
      .map((i: any) => {
        const stats = calcStats(i.places || []);
        if (!stats) return null;
        return {
          name: cleanName(i.itemName || i.item || ""),
          ...stats
        };
      })
      .filter((i: any) => i !== null)
      .sort((a: any, b: any) => parseFloat(a.avgPlacement) - parseFloat(b.avgPlacement));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          source: "MetaTFT",
          endpoint: "/tft-stat-api/items",
          rank,
          lastUpdated: new Date().toISOString(),
          itemsCount: items.length,
          items
        }, null, 2)
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

// ============== tft_meta_traits ==============
export async function handleTftMetaTraits(args?: { rank?: string }) {
  try {
    const rank = args?.rank || DEFAULT_RANK;
    const url = `${METATFT_API_BASE}/tft-stat-api/traits?queue=1100&patch=current&days=3&rank=${rank}`;

    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const json = await response.json() as any;
    const results = json?.results || [];

    const traits = results
      .map((t: any) => {
        const stats = calcStats(t.places || []);
        if (!stats) return null;

        // Parse trait name and level (e.g., "TFT16_Brawler_2" -> "Brawler 2")
        const traitId = t.trait || "";
        const match = traitId.match(/^TFT\d+_(.+)_(\d+)$/);
        let name = traitId;
        let level = 0;

        if (match) {
          name = match[1].replace(/Unique$/, "");
          level = parseInt(match[2], 10);
        } else {
          name = cleanName(traitId);
        }

        return {
          name,
          level,
          ...stats
        };
      })
      .filter((t: any) => t !== null)
      .sort((a: any, b: any) => parseFloat(a.avgPlacement) - parseFloat(b.avgPlacement));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          source: "MetaTFT",
          endpoint: "/tft-stat-api/traits",
          rank,
          lastUpdated: new Date().toISOString(),
          traitsCount: traits.length,
          traits
        }, null, 2)
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

// ============== tft_unit_builds ==============
export async function handleTftUnitBuilds() {
  try {
    const url = `${METATFT_API_BASE}/tft-comps-api/unit_items_processed?region_hint=euw1`;

    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const json = await response.json() as any;
    const unitsData = json?.units || {};

    const builds = Object.entries(unitsData)
      .map(([unitId, data]: [string, any]) => {
        const items = (data.items || []).slice(0, 5).map((i: any) => cleanName(i.itemName || ""));
        return {
          unit: cleanName(unitId),
          avgPlacement: data.avg?.toFixed(2) || "-",
          pickRate: `${((data.pick || 0) * 100).toFixed(1)}%`,
          games: data.count || 0,
          bestItems: items
        };
      })
      .filter((b: any) => b.games > 0)
      .sort((a: any, b: any) => parseFloat(a.avgPlacement) - parseFloat(b.avgPlacement));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          source: "MetaTFT",
          endpoint: "/tft-comps-api/unit_items_processed",
          lastUpdated: new Date().toISOString(),
          unitsCount: builds.length,
          builds
        }, null, 2)
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

// ============== tft_current_patch ==============
export async function handleTftCurrentPatch() {
  try {
    const url = `${METATFT_API_BASE}/tft-stat-api/patch`;

    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const json = await response.json() as any;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          source: "MetaTFT",
          endpoint: "/tft-stat-api/patch",
          lastUpdated: new Date().toISOString(),
          patch: {
            version: `${json.patch || "?"}${json.b_patch_version || ""}`,
            patchNumber: json.patch || "?",
            hotfix: json.b_patch_version || "",
            gamesAnalyzed: json.count || 0,
            dataStartDate: json.start || null
          }
        }, null, 2)
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
