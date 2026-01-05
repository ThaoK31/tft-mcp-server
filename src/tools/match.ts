import { CURRENT_PUUID, fetchWithErrorHandling, getCurrentRiotApiBase } from "../utils.js";
import { getChampionName, getItemName, getTraitName, formatActiveTraits, raritytoCost } from "../datadragon.js";

// Tool handlers
export async function handleTftMatchHistory(params: any) {
  const { count = 20, start = 0 } = params;
  const apiBase = getCurrentRiotApiBase();
  const url = `${apiBase}/tft/match/v1/matches/by-puuid/${CURRENT_PUUID}/ids?start=${start}&count=${count}`;

  try {
    const response = await fetchWithErrorHandling(url);
    const matchIds = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ matchIds }, null, 2)
        }
      ],
      isError: false
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error)
            },
            null,
            2
          )
        }
      ],
      isError: true
    };
  }
}

export async function handleTftMatchDetails(params: any) {
  const { matchId } = params;
  const apiBase = getCurrentRiotApiBase();
  const url = `${apiBase}/tft/match/v1/matches/${matchId}`;

  try {
    const response = await fetchWithErrorHandling(url);
    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ],
      isError: false
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error)
            },
            null,
            2
          )
        }
      ],
      isError: true
    };
  }
}

interface MatchData {
  metadata: {
    match_id: string;
    participants: string[];
  };
  info: {
    game_datetime: number;
    game_length: number;
    tft_game_type: string;
    tft_set_number: number;
    participants: Array<{
      puuid: string;
      placement: number;
      level: number;
      gold_left: number;
      last_round: number;
      time_eliminated: number;
      total_damage_to_players: number;
      players_eliminated: number;
      riotIdGameName: string;
      riotIdTagline: string;
      traits: Array<{
        name: string;
        num_units: number;
        style: number;
        tier_current: number;
        tier_total: number;
      }>;
      units: Array<{
        character_id: string;
        tier: number;
        rarity: number;
        itemNames: string[];
      }>;
      augments?: string[];
    }>;
  };
}

export async function handleTftMatchSummary(params: any) {
  const { matchId } = params;
  const apiBase = getCurrentRiotApiBase();
  const url = `${apiBase}/tft/match/v1/matches/${matchId}`;

  try {
    const response = await fetchWithErrorHandling(url);
    const data = await response.json() as MatchData;

    // Trouver le joueur actuel
    const currentPlayer = data.info.participants.find(p => p.puuid === CURRENT_PUUID);

    // Formater tous les joueurs avec leur placement
    const players = data.info.participants
      .sort((a, b) => a.placement - b.placement)
      .map(p => {
        const isCurrentPlayer = p.puuid === CURRENT_PUUID;
        const activeTraits = formatActiveTraits(p.traits);

        // Formater les unités
        const units = p.units
          .sort((a, b) => raritytoCost(b.rarity) - raritytoCost(a.rarity))
          .map(u => {
            const name = getChampionName(u.character_id);
            const stars = "⭐".repeat(u.tier);
            const cost = raritytoCost(u.rarity);
            const items = u.itemNames.map(i => getItemName(i));
            return {
              name,
              stars: u.tier,
              cost,
              items
            };
          });

        // Formater les augments si disponibles
        const augments = p.augments?.map(a => {
          // Nettoyer le nom de l'augment
          const match = a.match(/TFT\d+_Augment_(.+)/);
          return match ? match[1].replace(/([A-Z])/g, ' $1').trim() : a;
        }) || [];

        return {
          name: `${p.riotIdGameName}#${p.riotIdTagline}`,
          isYou: isCurrentPlayer,
          placement: p.placement,
          level: p.level,
          goldLeft: p.gold_left,
          lastRound: p.last_round,
          damageDealt: p.total_damage_to_players,
          playersEliminated: p.players_eliminated,
          traits: activeTraits,
          units,
          augments
        };
      });

    // Durée de la partie en minutes
    const durationMinutes = Math.round(data.info.game_length / 60);

    const summary = {
      matchId: data.metadata.match_id,
      gameType: data.info.tft_game_type,
      setNumber: data.info.tft_set_number,
      duration: `${durationMinutes} minutes`,
      date: new Date(data.info.game_datetime).toLocaleString(),
      yourPlacement: currentPlayer?.placement || "N/A",
      players
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(summary, null, 2)
        }
      ],
      isError: false
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error)
            },
            null,
            2
          )
        }
      ],
      isError: true
    };
  }
}
