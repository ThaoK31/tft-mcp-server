/**
 * Test du nouvel outil tft_match_tracker
 */

import fetch from "node-fetch";
import { gunzipSync } from "zlib";

const METATFT_API = "https://api.metatft.com";
const METATFT_S3 = "https://metatft-matches-2.ams3.digitaloceanspaces.com";

async function test() {
  console.log("🧪 Test tft_match_tracker\n");
  console.log("=".repeat(60));

  // 1. Fetch profile
  console.log("\n📡 Fetching MetaTFT profile...");
  const profileUrl = `${METATFT_API}/public/profile/lookup_by_riotid/EUW1/ThaoK3/EUW?source=full_profile&tft_set=TFTSet16`;
  const profileResp = await fetch(profileUrl);
  const profile = await profileResp.json();

  console.log(`✅ app_matches count: ${profile.app_matches?.length || 0}`);

  if (!profile.app_matches || profile.app_matches.length === 0) {
    console.log("❌ No tracker data available");
    return;
  }

  // 2. Get first match with tracker data
  const appMatch = profile.app_matches[1]; // Le match qu'on a testé
  console.log(`\n📦 Match: ${appMatch.match_id_ow}`);
  console.log(`   UUID: ${appMatch.uuid}`);
  console.log(`   Date: ${new Date(appMatch.created_timestamp).toLocaleString()}`);

  // 3. Fetch tracker data
  console.log("\n📥 Fetching tracker data from S3...");
  const s3Url = `${METATFT_S3}/${appMatch.uuid}.json`;
  const s3Resp = await fetch(s3Url);
  const buffer = await s3Resp.buffer();

  let trackerData;
  try {
    const decompressed = gunzipSync(buffer);
    trackerData = JSON.parse(decompressed.toString("utf-8"));
  } catch {
    trackerData = JSON.parse(buffer.toString("utf-8"));
  }

  console.log(`✅ Tracker data loaded`);
  console.log(`   Match ID: ${trackerData.match_id}`);
  console.log(`   Server: ${trackerData.server}`);
  console.log(`   Summoner: ${trackerData.summoner_name}`);

  // 4. Parse stage_data
  let stages;
  try {
    stages = JSON.parse(trackerData.stage_data);
  } catch {
    stages = trackerData.stage_data;
  }

  console.log(`   Stages: ${stages.length}`);

  // 5. Show first and last stage
  console.log("\n📊 First stage:");
  const first = stages[0];
  console.log(`   Stage: ${first.stage}`);
  console.log(`   HP: ${first.me?.health}, Gold: ${first.me?.gold}, Level: ${first.me?.level}`);

  console.log("\n📊 Last stage:");
  const last = stages[stages.length - 1];
  console.log(`   Stage: ${last.stage}`);
  console.log(`   HP: ${last.me?.health}, Gold: ${last.me?.gold}, Level: ${last.me?.level}`);

  if (last.board?.units) {
    console.log(`   Board units: ${last.board.units.length}`);
    last.board.units.slice(0, 3).forEach(u => {
      console.log(`     - ${u.character_id} ⭐${u.tier}`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Test passed!");
}

test().catch(e => {
  console.error("❌ Test failed:", e.message);
  process.exit(1);
});
