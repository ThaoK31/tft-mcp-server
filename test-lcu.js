/**
 * POC: League Client Update (LCU) API Connection
 * Version JS simple pour test rapide
 */

import fs from "fs";
import https from "https";

// Chemins possibles pour le lockfile
const LOCKFILE_PATHS = [
  "C:\\Riot Games\\League of Legends\\lockfile",
  "D:\\Riot Games\\League of Legends\\lockfile",
  "C:\\Program Files\\Riot Games\\League of Legends\\lockfile",
  "D:\\Program Files\\Riot Games\\League of Legends\\lockfile",
  // Ajouter d'autres chemins si besoin
];

/**
 * Trouve et parse le fichier lockfile
 */
function findLockfile() {
  for (const lockfilePath of LOCKFILE_PATHS) {
    if (fs.existsSync(lockfilePath)) {
      console.log(`✅ Lockfile trouvé: ${lockfilePath}`);
      const content = fs.readFileSync(lockfilePath, "utf-8");
      console.log(`   Contenu: ${content}`);

      // Format: LeagueClient:pid:port:password:https
      const parts = content.split(":");
      if (parts.length >= 5) {
        return {
          processName: parts[0],
          pid: parseInt(parts[1], 10),
          port: parseInt(parts[2], 10),
          password: parts[3],
          protocol: parts[4],
        };
      }
    }
  }

  console.log("❌ Lockfile non trouvé. Le client LoL est-il lancé ?");
  console.log("   Chemins testés:");
  for (const p of LOCKFILE_PATHS) {
    console.log(`   - ${p}`);
  }
  return null;
}

/**
 * Fait une requête à l'API LCU
 */
function lcuRequest(credentials, endpoint) {
  const auth = Buffer.from(`riot:${credentials.password}`).toString("base64");

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port: credentials.port,
      path: endpoint,
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on("error", (e) => reject(e));
    req.end();
  });
}

/**
 * Explore les endpoints TFT disponibles
 */
async function exploreTFTEndpoints(credentials) {
  const endpoints = [
    // Gameflow - état général
    "/lol-gameflow/v1/gameflow-phase",
    "/lol-gameflow/v1/session",
    "/lol-gameflow/v1/availability",

    // Summoner info
    "/lol-summoner/v1/current-summoner",

    // Lobby
    "/lol-lobby/v2/lobby",
    "/lol-lobby/v2/lobby/members",
    "/lol-lobby/v2/comms/members",

    // TFT spécifique
    "/lol-tft/v1/tft/homeHub",
    "/lol-tft/v1/tft/events",
    "/lol-tft/v2/tft/battlepass",
    "/lol-tft/v1/tft/storePromos",

    // TFT Team Planner
    "/lol-tft-team-planner/v1/team/local",
    "/lol-tft-team-planner/v1/config",

    // TFT Troves (coffres)
    "/lol-tft-troves/v1/config",
    "/lol-tft-troves/v1/banners",

    // Champ select / game
    "/lol-champ-select/v1/session",
    "/lol-champ-select/v1/current-champion",

    // Game client live
    "/lol-gameflow/v1/gameflow-metadata/player-status",
    "/lol-spectator/v1/spectate",

    // Ranked
    "/lol-ranked/v1/current-ranked-stats",
    "/lol-ranked/v1/rated-ladder/TFT",

    // Collections (little legends, arenas)
    "/lol-cosmetics/v1/inventories/tft/companions",
    "/lol-cosmetics/v1/inventories/tft/map-skins",
    "/lol-cosmetics/v1/inventories/tft/damage-skins",
  ];

  console.log("\n📡 Exploration des endpoints...\n");

  for (const endpoint of endpoints) {
    try {
      const result = await lcuRequest(credentials, endpoint);
      const status = result.status === 200 ? "✅" : "⚠️ ";
      const preview = JSON.stringify(result.data).slice(0, 200);
      console.log(`${status} ${endpoint}`);
      console.log(`   Status: ${result.status}`);
      if (result.status === 200) {
        console.log(`   Data: ${preview}${preview.length >= 200 ? "..." : ""}`);
      }
      console.log();
    } catch (error) {
      console.log(`❌ ${endpoint}`);
      console.log(`   Error: ${error.message}`);
      console.log();
    }
  }
}

/**
 * Main
 */
async function main() {
  console.log("🎮 LCU API POC - TFT Tracker\n");
  console.log("=".repeat(50));

  // 1. Trouver le lockfile
  const credentials = findLockfile();
  if (!credentials) {
    console.log("\n💡 Lance le client League of Legends et réessaie.");
    process.exit(1);
  }

  console.log(`\n📋 Credentials LCU:`);
  console.log(`   Port: ${credentials.port}`);
  console.log(`   PID: ${credentials.pid}`);
  console.log(`   Password: ${credentials.password.slice(0, 8)}...`);

  // 2. Test de connexion basique
  console.log("\n🔌 Test de connexion...");
  try {
    const result = await lcuRequest(credentials, "/lol-gameflow/v1/gameflow-phase");
    console.log(`✅ Connecté! Phase actuelle: ${JSON.stringify(result.data)}`);
  } catch (error) {
    console.log(`❌ Erreur de connexion: ${error.message}`);
    process.exit(1);
  }

  // 3. Explorer les endpoints
  await exploreTFTEndpoints(credentials);

  console.log("=".repeat(50));
  console.log("🎯 POC terminé!");
}

main().catch(console.error);
