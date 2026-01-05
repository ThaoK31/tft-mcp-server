/**
 * Test détaillé des données TFT live
 */

import https from "https";

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
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on("error", (e) => reject(e));
    req.end();
  });
}

async function main() {
  console.log("🎮 Données TFT Live détaillées\n");
  console.log("=".repeat(60));

  try {
    // 1. Game Stats
    console.log("\n📊 GAME STATS:\n");
    const stats = await gameClientRequest("/liveclientdata/gamestats");
    console.log(JSON.stringify(stats, null, 2));

    // 2. Active Player (toi)
    console.log("\n👤 ACTIVE PLAYER (toi):\n");
    const player = await gameClientRequest("/liveclientdata/activeplayer");
    console.log(JSON.stringify(player, null, 2));

    // 3. All Players
    console.log("\n👥 ALL PLAYERS:\n");
    const allPlayers = await gameClientRequest("/liveclientdata/playerlist");
    console.log(`Nombre de joueurs: ${allPlayers.length}`);
    for (const p of allPlayers) {
      console.log(`  - ${p.riotIdGameName}#${p.riotIdTagLine} | Level: ${p.level} | Dead: ${p.isDead}`);
    }

    // 4. Events
    console.log("\n📅 EVENTS:\n");
    const events = await gameClientRequest("/liveclientdata/eventdata");
    console.log(JSON.stringify(events, null, 2));

    // 5. All Game Data (full)
    console.log("\n📦 ALL GAME DATA (résumé):\n");
    const allData = await gameClientRequest("/liveclientdata/allgamedata");
    console.log("Keys disponibles:", Object.keys(allData));

    // Voir si y'a des données TFT spécifiques
    if (allData.activePlayer) {
      console.log("\nActive Player keys:", Object.keys(allData.activePlayer));
    }
    if (allData.allPlayers && allData.allPlayers[0]) {
      console.log("Player keys:", Object.keys(allData.allPlayers[0]));
    }

  } catch (e) {
    console.log("❌ Erreur:", e.message);
    console.log("   Le jeu est-il encore en cours ?");
  }

  console.log("\n" + "=".repeat(60));
}

main();
