# MetaTFT Tracker API - Round-by-Round Data

Documentation sur l'accès aux données round-by-round des parties TFT via MetaTFT.

## Contexte

Riot Games ne fournit pas de données round-by-round via son API officielle. Les outils comme MetaTFT utilisent un tracker local (via Overwolf) pour collecter ces données pendant les parties.

## Solution Découverte

Les données tracker sont stockées sur DigitalOcean Spaces (S3) et accessibles via l'API publique MetaTFT.

### Étape 1 : Récupérer le mapping match_id → UUID

```
GET https://api.metatft.com/public/profile/lookup_by_riotid/{region}/{gameName}/{tagLine}?source=full_profile&tft_set=TFTSet16
```

**Exemple:**
```
GET https://api.metatft.com/public/profile/lookup_by_riotid/EUW1/ThaoK3/EUW?source=full_profile&tft_set=TFTSet16
```

**Réponse (extrait):**
```json
{
  "app_matches": [
    {
      "uuid": "0382901a-a843-491d-b54a-081694187fe5",
      "match_id_ow": "7671240308",
      "player_id": 709420,
      "created_timestamp": 1767559260175,
      "match_data_url": "https://metatft-matches-2.ams3.digitaloceanspaces.com/0382901a-a843-491d-b54a-081694187fe5.json"
    }
  ]
}
```

**Important:**
- `match_id_ow` est le match ID **sans** le préfixe région (ex: `7671240308` pas `EUW1_7671240308`)
- `app_matches` ne contient que les parties où le tracker MetaTFT était actif

### Étape 2 : Télécharger le fichier tracker

```
GET https://metatft-matches-2.ams3.digitaloceanspaces.com/{uuid}.json
```

**Exemple:**
```
GET https://metatft-matches-2.ams3.digitaloceanspaces.com/0382901a-a843-491d-b54a-081694187fe5.json
```

**Note:** Le fichier est compressé en gzip. Utilisez l'header `Accept-Encoding: gzip` ou décompressez manuellement.

### Structure des données tracker

```json
{
  "match_id": "7671240308",
  "server": "EUW1",
  "summoner_name": "ThaoK3",
  "uuid": "0382901a-a843-491d-b54a-081694187fe5",
  "stage_data": "[{...}]"  // String JSON à parser
}
```

### Structure de `stage_data`

`stage_data` est une string JSON contenant un array d'objets, un par stage :

```json
[
  {
    "stage": "1-1",
    "board": {
      "units": [
        {
          "character_id": "TFT16_Ahri",
          "tier": 1,
          "items": ["TFT_Item_BFSword"]
        }
      ]
    },
    "bench": [...],
    "me": {
      "health": "100",
      "gold": "5",
      "level": "1",
      "xp": "0/2"
    },
    "opponents": [
      {
        "name": "Player2#EUW",
        "health": "100"
      }
    ],
    "round_result": "win" | "loss" | null
  }
]
```

## Limitations

1. **Tracker requis**: Les données ne sont disponibles que si le joueur avait le tracker MetaTFT actif pendant la partie
2. **Joueur spécifique**: Chaque fichier tracker contient les données du point de vue d'un seul joueur
3. **Pas de données adversaires détaillées**: On voit les boards adverses seulement lors des combats (scouting)

## Fichiers S3 associés

| URL Pattern | Contenu |
|-------------|---------|
| `metatft-matches-2.ams3.digitaloceanspaces.com/{match_id}.json` | Données match Riot (compressé gzip) |
| `metatft-matches-2.ams3.digitaloceanspaces.com/{uuid}.json` | Données tracker (compressé gzip) |

## Authentification

Aucune authentification requise pour ces endpoints. Ils sont publiquement accessibles.

## Investigation (Janvier 2026)

Cette documentation est le résultat d'une investigation approfondie :

1. **LCU API / Game Client API**: Non viable - Riot limite les données TFT pour empêcher les bots
2. **MetaTFT GraphQL**: N'existe pas (404)
3. **SSR/HTML embedding**: MetaTFT est un SPA React, pas de données dans le HTML
4. **Solution finale**: Champ `app_matches` dans l'API profile publique

Voir `TODO.md` pour l'historique complet du POC.
