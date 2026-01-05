# TFT MCP Server

A Model Context Protocol (MCP) server for Teamfight Tactics (TFT) Set 16 that provides comprehensive access to TFT game data, match analysis, and meta information.

## Features

- **Match History & Details**: Get your recent matches with full composition data
- **Match Summaries**: Formatted summaries with readable champion, item, and trait names
- **Ranked Stats**: Current rank, LP, winrate, and games played
- **Meta Data**: Current meta compositions and augments from MetaTFT
- **Multi-Region Support**: EUW, NA, KR, EUNE, TR, RU, BR, LAN, LAS, OCE, JP, PH, SG, TH, TW, VN

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

### tft_match_history

Get your recent TFT match IDs.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `count` | number | 20 | Number of matches to retrieve |
| `start` | number | 0 | Start index for pagination |

### tft_match_details

Get raw API data for a specific match.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `matchId` | string | Yes | Match ID (e.g., `EUW1_7671287805`) |

### tft_match_summary

Get a formatted, readable summary of a match with champion names, items, traits, and placements.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `matchId` | string | Yes | Match ID |

### tft_ranked_stats

Get your current ranked stats (rank, LP, winrate, games played).

*No parameters required.*

### tft_meta_comps

Get current meta compositions from MetaTFT with tier ratings and winrates.

*No parameters required.*

### tft_meta_augments

Get current meta augments from MetaTFT with performance stats.

*No parameters required.*

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

If your tag line isn't recognized, the server will warn you and use `americas` as default. You can override with `--region` parameter.

## Data Sources

- **Riot Games API**: Match history, match details
- **Community Dragon**: Champion, item, and trait name mappings (Set 16)
- **lolchess.gg**: Ranked stats (fallback since Riot deprecated summoner ID endpoints in July 2025)
- **MetaTFT REST API** (`api-hc.metatft.com`): Meta compositions with stats, augments tier list (30min cache)

## Known Limitations

- **tft_ranked_stats**: Riot API deprecated `by-summoner` endpoints. Uses lolchess.gg scraping as fallback.
- **tft_meta_comps**: Uses MetaTFT REST API. Returns calculated stats (win rate, top4, avg placement).
- **tft_meta_augments**: Tier list only (no detailed stats), based on MetaTFT community rankings.

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
