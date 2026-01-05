# TFT MCP Server

[![npm version](https://img.shields.io/npm/v/mcp-server-tft.svg)](https://www.npmjs.com/package/mcp-server-tft)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TFT Set](https://img.shields.io/badge/TFT-Set%2016-blue.svg)](https://teamfighttactics.leagueoflegends.com/)

A Model Context Protocol (MCP) server for Teamfight Tactics (TFT) Set 16 that provides comprehensive access to TFT game data, match analysis, meta information, and personalized coaching.

## Features

- **Match History & Details**: Get your recent matches with full composition data
- **Match Summaries**: Formatted summaries with readable champion, item, and trait names
- **Round-by-Round Analysis**: Detailed tracker data (HP, gold, board state per round)
- **Ranked Stats**: Current rank, LP, winrate, and games played
- **Meta Data**: Current meta compositions, augments, units, items, and traits from MetaTFT
- **Personalized Coaching**: AI-powered analysis of your playstyle with recommendations
- **LP History**: Track your LP progression over time
- **Multi-Region Support**: EUW, NA, KR, EUNE, TR, RU, BR, LAN, LAS, OCE, JP, and more

## Prerequisites

- Node.js (v18 or higher)
- Riot Games API Key from [Riot Developer Portal](https://developer.riotgames.com/)
- Your Riot ID (Game Name + Tag Line, e.g., `ThaoK3#EUW`)

## Installation

### Via npx (Recommended)

```bash
npx mcp-server-tft --apiKey YOUR_API_KEY --gameName YOUR_NAME --tagLine YOUR_TAG
```

### From Source

```bash
git clone https://github.com/ThaoK31/tft-mcp-server.git
cd tft-mcp-server
npm install
npm run build
```

## Configuration

### Claude Desktop

Location:
- **MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tft": {
      "command": "npx",
      "args": [
        "mcp-server-tft",
        "--apiKey", "RGAPI-xxx-xxx",
        "--gameName", "YourName",
        "--tagLine", "EUW"
      ]
    }
  }
}
```

### Claude Code

Create `.mcp.json` in your project directory:

```json
{
  "mcpServers": {
    "tft": {
      "command": "node",
      "args": [
        "/path/to/tft-mcp-server/dist/index.js",
        "--apiKey", "RGAPI-xxx-xxx",
        "--gameName", "YourName",
        "--tagLine", "EUW"
      ]
    }
  }
}
```

## Available Tools

### Match Tools

| Tool | Description |
|------|-------------|
| `tft_match_history` | Get recent match IDs (params: `count`, `start`) |
| `tft_match_details` | Get raw API data for a match (param: `matchId`) |
| `tft_match_summary` | Get formatted summary with readable names (param: `matchId`) |
| `tft_match_tracker` | Get round-by-round data: HP, gold, board, bench (params: `matchId`, `mode`) |

### Player Stats

| Tool | Description |
|------|-------------|
| `tft_ranked_stats` | Current rank, LP, winrate, games played |
| `tft_lp_history` | LP progression tracking (params: `action`, `matchCount`) |
| `tft_coaching` | Personalized recommendations based on recent matches (param: `matchCount`) |
| `tft_compare_players` | Compare your stats with another player (params: `gameName`, `tagLine`) |
| `tft_lookup_player` | Look up any player's rank and recent performance |
| `tft_export_data` | Export match data to CSV or JSON format |

### Meta Data

| Tool | Description |
|------|-------------|
| `tft_meta_comps` | Current meta compositions with tier ratings |
| `tft_meta_augments` | Augment tier list |
| `tft_meta_units` | Stats for all champions (avg placement, win rate, top4) |
| `tft_meta_items` | Stats for all items (avg placement, win rate) |
| `tft_meta_traits` | Stats for all traits by level (e.g., Brawler 2, Brawler 4) |
| `tft_unit_builds` | Best-in-slot items for each champion |
| `tft_best_items` | Best individual items for a specific champion |
| `tft_current_patch` | Current patch info and total games analyzed |

### Game Info (Set 16)

| Tool | Description |
|------|-------------|
| `tft_champion_info` | Champion details: cost, traits, ability, stats |
| `tft_trait_info` | Trait details: description, breakpoints, champions |
| `tft_list_champions` | List all champions (filter by cost or trait) |
| `tft_list_traits` | List all traits with breakpoints |

### Tool Details

#### tft_match_tracker

Get round-by-round tracker data for deep game analysis.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `matchId` | string | *required* | Match ID (e.g., `EUW1_7671240308`) |
| `mode` | string | `summary` | `summary` = key stages only, `complete` = all rounds |

**Note**: Only available for games played with MetaTFT tracker active.

#### tft_coaching

Get personalized coaching recommendations based on recent match analysis.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `matchCount` | number | 10 | Number of recent matches to analyze |

Returns:
- Performance summary (avg placement, top4 rate, win rate)
- Best/worst performing units, items, and traits
- Comparison with meta data
- Personalized recommendations

#### tft_lp_history

Track LP progression over time with local storage.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `action` | string | `view` | `view` = show history, `update` = fetch new matches, `reset` = clear |
| `matchCount` | number | 10 | Matches to check for updates |

#### tft_compare_players

Compare your stats with another player side-by-side.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `gameName` | string | *required* | Other player's game name |
| `tagLine` | string | *required* | Other player's tag line (e.g., `EUW`, `NA1`) |
| `matchCount` | number | 10 | Recent matches to analyze per player |

Returns:
- Side-by-side rank and stats comparison
- Win rate, top 4 rate, avg placement verdict
- Most played units and traits for both players
- Shared playstyle elements
- Best/worst performing units for each player

#### tft_lookup_player

Look up any player's rank and recent performance without comparing to yourself.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `gameName` | string | *required* | Player's game name |
| `tagLine` | string | *required* | Player's tag line (e.g., `EUW`, `NA1`) |
| `matchCount` | number | 5 | Recent matches to show |

#### tft_best_items

Get best **individual** items for a champion (ranked by performance, NOT item combos). For full BiS builds, use `tft_unit_builds`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `champion` | string | *required* | Champion name (e.g., `Kindred`, `Jinx`) |

Returns:
- Champion overall stats (avg placement, pick rate)
- Top 10 individual items ranked by performance
- Quick tip with top 3 items

#### tft_export_data

Export your recent match data to CSV or JSON format for external analysis.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `json` | Export format (`csv` or `json`) |
| `matchCount` | number | 10 | Number of matches to export |

## Region Detection

The server auto-detects your region from your tag line:

| Tag Line | Region | Platform |
|----------|--------|----------|
| EUW | europe | euw1 |
| EUNE | europe | eun1 |
| NA, NA1 | americas | na1 |
| KR | asia | kr |
| JP | asia | jp1 |
| OCE | sea | oc1 |
| BR | americas | br1 |
| TR | europe | tr1 |
| RU | europe | ru |

If your tag line isn't recognized, use `--region` parameter.

## Data Sources

- **Riot Games API**: Match history, match details, account data
- **Community Dragon**: Champion, item, and trait name mappings (Set 16)
- **lolchess.gg**: Ranked stats (fallback since Riot deprecated summoner ID endpoints)
- **MetaTFT API** (`api-hc.metatft.com`): Meta compositions, augments, units, items, traits (30min cache)
- **MetaTFT S3**: Round-by-round tracker data for supported matches

## Known Limitations

- **tft_ranked_stats**: Uses lolchess.gg scraping (Riot API deprecated `by-summoner` endpoints)
- **tft_meta_augments**: Tier list only (no detailed stats)
- **tft_match_tracker**: Only works for games played with MetaTFT Overwolf tracker
- **tft_lp_history**: LP changes are estimated; actual LP may vary based on MMR

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Test the server
node test-mcp.js
```

## License

MIT

## Credits

Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
