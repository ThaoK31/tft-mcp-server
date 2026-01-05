/**
 * Test APIs pendant une game TFT
 * - LCU API (client) - voir si plus de données en game
 * - Game Client API (port 2999) - données live
 */

import fs from "fs";
import https from "https";

// ============== LCU API ==============

const LOCKFILE_PATH = "C:\\Riot Games\\League of Legends\\lockfile";

function getLCUCredentials() {
  if (!fs.existsSync(LOCKFILE_PATH)) return null;
  const content = fs.readFileSync(LOCKFILE_PATH, "utf-8");
  const parts = content.split(":");
  return {
    port: parseInt(parts[2], 10),
    password: parts[3],
  };
}

function lcuRequest(credentials, endpoint) {
  const auth = Buffer.from(`riot:${credentials.password}`).toString("base64");
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "127.0.0.1",
      port: credentials.port,
      path: endpoint,
      method: "GET",
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      rejectUnauthorized: false,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", (e) => reject(e));
    req.end();
  });
}

// ============== Game Client API (2999) ==============

function gameClientRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "127.0.0.1",
      port: 2999,
      path: endpoint,
      method: "GET",
      headers: { Accept: "application/json" },
      rejectUnauthorized: false,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.setTimeout(3000, () => { req.destroy(); resolve({ status: 0, error: "timeout" }); });
    req.end();
  });
}

// ============== Main ==============

async function main() {
  console.log("🎮 Test APIs In-Game TFT\n");
  console.log("=".repeat(60));

  // 1. Test LCU API
  console.log("\n📡 LCU API (Client):\n");
  const creds = getLCUCredentials();
  if (!creds) {
    console.log("❌ Client LoL non détecté");
  } else {
    const lcuEndpoints = [
      "/lol-gameflow/v1/gameflow-phase",
      "/lol-gameflow/v1/session",
      "/lol-gameflow/v1/gameflow-metadata/player-status",
    ];

    for (const ep of lcuEndpoints) {
      const result = await lcuRequest(creds, ep);
      const status = result.status === 200 ? "✅" : "⚠️";
      console.log(`${status} ${ep}`);
      console.log(`   Status: ${result.status}`);
      if (result.status === 200) {
        const preview = JSON.stringify(result.data).slice(0, 300);
        console.log(`   Data: ${preview}...`);
      }
      console.log();
    }
  }

  // 2. Test Game Client API (port 2999)
  console.log("\n📡 Game Client API (Port 2999):\n");

  const gameEndpoints = [
    "/",
    "/swagger/v1/api-docs",
    "/swagger/v2/api-docs",
    "/swagger/v3/api-docs",
    "/liveclientdata/allgamedata",
    "/liveclientdata/activeplayer",
    "/liveclientdata/playerlist",
    "/liveclientdata/eventdata",
    "/liveclientdata/gamestats",
    "/riot/liveclientdata/allgamedata",
    "/Help",
    "/replay/playback",
  ];

  for (const ep of gameEndpoints) {
    const result = await gameClientRequest(ep);
    if (result.error) {
      console.log(`❌ ${ep}`);
      console.log(`   Error: ${result.error}`);
    } else {
      const status = result.status === 200 ? "✅" : "⚠️";
      console.log(`${status} ${ep}`);
      console.log(`   Status: ${result.status}`);
      if (result.status === 200) {
        const preview = JSON.stringify(result.data).slice(0, 400);
        console.log(`   Data: ${preview}...`);
      }
    }
    console.log();
  }

  console.log("=".repeat(60));
  console.log("🎯 Test terminé!");
}

main().catch(console.error);
