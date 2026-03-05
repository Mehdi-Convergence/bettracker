"""Research sports data via Claude Code CLI (subprocess).

Uses `claude -p "prompt" --output-format json` to leverage Claude Max
web search capabilities for live odds, form, injuries, lineups, H2H, etc.
Results are cached locally in data/cache/research/.
"""

import asyncio
import hashlib
import json
import logging
import re
import subprocess
import time
from datetime import datetime
from functools import partial
from pathlib import Path

logger = logging.getLogger(__name__)

CACHE_DIR = Path("data/cache/research")
CACHE_TTL_SCAN = 3600 * 4       # 4h for general scans
CACHE_TTL_DEEP = 3600 * 2       # 2h for deep research
CLAUDE_TIMEOUT = 600             # 10 min max per call
SCAN_MODEL = "opus"              # Opus for scans (faster web search ~1min vs sonnet ~4min)
DEEP_MODEL = "opus"              # Opus for deep research (better quality)

# Resolve claude CLI paths (Windows: bypass .cmd wrapper, call node directly)
import shutil
import os


def _find_claude_paths() -> tuple[str, list[str]]:
    """Find node.exe and claude cli.js paths for direct invocation.

    Returns (description, cmd_list) where cmd_list is the base command to run.
    On Windows, .cmd wrappers cause shell escaping issues with complex prompts,
    so we call node.exe + cli.js directly.
    """
    # Strategy 1: Find .cmd wrapper via shutil.which, then resolve node+cli.js
    cmd_path = shutil.which("claude")
    if cmd_path:
        cmd_dir = os.path.dirname(os.path.abspath(cmd_path))
        node_exe = os.path.join(cmd_dir, "node.exe")
        cli_js = os.path.join(cmd_dir, "node_modules", "@anthropic-ai", "claude-code", "cli.js")
        if os.path.isfile(node_exe) and os.path.isfile(cli_js):
            return f"node direct: {node_exe}", [node_exe, cli_js]

    # Strategy 2: Check common Windows locations
    for base_dir in [
        r"C:\Program Files\nodejs",
        os.path.expanduser(r"~\AppData\Roaming\npm"),
    ]:
        node_exe = os.path.join(base_dir, "node.exe")
        cli_js = os.path.join(base_dir, "node_modules", "@anthropic-ai", "claude-code", "cli.js")
        if os.path.isfile(node_exe) and os.path.isfile(cli_js):
            return f"node direct: {node_exe}", [node_exe, cli_js]

    # Strategy 3: node in PATH + global npm package
    node_path = shutil.which("node")
    if node_path:
        npm_prefix = os.path.expanduser(r"~\AppData\Roaming\npm")
        cli_js = os.path.join(npm_prefix, "node_modules", "@anthropic-ai", "claude-code", "cli.js")
        if os.path.isfile(cli_js):
            return f"node PATH: {node_path}", [node_path, cli_js]

    # Fallback: use .cmd wrapper with shell=True (may fail with complex prompts)
    if cmd_path:
        return f"cmd fallback: {cmd_path}", [cmd_path]

    return "not found", ["claude"]


CLAUDE_DESC, CLAUDE_BASE_CMD = _find_claude_paths()
CLAUDE_USE_SHELL = len(CLAUDE_BASE_CMD) == 1  # Only need shell for .cmd fallback
logger.info("Claude CLI resolved: %s (shell=%s)", CLAUDE_DESC, CLAUDE_USE_SHELL)


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

SCAN_FOOTBALL_PROMPT = """\
Tu es un analyste sportif professionnel. Recherche sur le web tous les matchs \
de football {leagues} prevus dans les {timeframe} prochaines heures/jours.

Pour CHAQUE match trouve, retourne les donnees suivantes en JSON.
Si une information n'est pas trouvable, mets null.

{{
  "matches": [
    {{
      "home_team": "PSG",
      "away_team": "Marseille",
      "league": "Ligue 1",
      "date": "2026-03-07T21:00:00",
      "venue": "Parc des Princes",
      "referee": "Francois Letexier",
      "weather": "12C, couvert, vent faible",
      "odds": {{
        "1x2": {{
          "H": {{"betclic": 1.45, "winamax": 1.47, "unibet": 1.44}},
          "D": {{"betclic": 4.50, "winamax": 4.40, "unibet": 4.55}},
          "A": {{"betclic": 7.00, "winamax": 6.80, "unibet": 6.90}}
        }},
        "over_under_2.5": {{"O": 1.65, "U": 2.20}},
        "btts": {{"yes": 1.75, "no": 2.00}},
        "double_chance": {{"1X": 1.12, "12": 1.20, "X2": 2.80}}
      }},
      "home_form": "VVVND",
      "away_form": "NDVVD",
      "home_form_detail": ["V 2-0 vs Lens", "V 3-1 vs Nice", "V 1-0 vs Rennes", "N 1-1 vs Monaco", "D 0-2 vs Lyon"],
      "away_form_detail": ["N 0-0 vs Toulouse", "D 1-3 vs Lille", "V 2-1 vs Nantes", "V 3-0 vs Brest", "D 0-1 vs Strasbourg"],
      "home_form_home": "VVVVV",
      "away_form_away": "NVDDV",
      "home_position": 1,
      "away_position": 8,
      "home_points": 65,
      "away_points": 38,
      "home_goals_scored": 58,
      "home_goals_conceded": 19,
      "away_goals_scored": 35,
      "away_goals_conceded": 32,
      "home_goals_scored_avg5": 2.2,
      "home_goals_conceded_avg5": 0.6,
      "away_goals_scored_avg5": 1.4,
      "away_goals_conceded_avg5": 1.2,
      "home_xg_avg": 2.1,
      "away_xg_avg": 1.3,
      "home_clean_sheets_last5": 3,
      "away_clean_sheets_last5": 1,
      "home_btts_pct": 55,
      "away_btts_pct": 65,
      "home_over25_pct": 70,
      "away_over25_pct": 60,
      "home_corners_avg": 6.5,
      "away_corners_avg": 4.8,
      "home_cards_avg": 1.8,
      "away_cards_avg": 2.3,
      "home_possession_avg": 62,
      "away_possession_avg": 48,
      "home_shots_pg": 16.3,
      "away_shots_pg": 11.2,
      "home_rest_days": 4,
      "away_rest_days": 3,
      "home_current_streak": "3 victoires",
      "away_current_streak": "1 defaite",
      "key_absences_home": ["Dembele (suspendu)", "Ramos (mollet)"],
      "key_absences_away": ["Aubameyang (cuisse)"],
      "home_top_scorer": "Mbappe (22 buts)",
      "away_top_scorer": "Greenwood (14 buts)",
      "h2h_last5": "3V 1N 1D",
      "h2h_avg_goals": 2.8,
      "motivation": "PSG vise le titre, OM doit assurer l'Europe",
      "context": "Classique, PSG invaincu a domicile cette saison"
    }}
  ]
}}

IMPORTANT: Mets TOUS les matchs trouves dans le tableau "matches", y compris \
les matchs de coupe et les matchs futurs. Ne separe pas en categories differentes.
Si aucun match n'est prevu dans le delai exact, inclus les matchs les plus proches.

Sources a consulter : Betclic, Flashscore, Transfermarkt, L'Equipe, FBref, WhoScored, Sofascore.
Retourne UNIQUEMENT le JSON valide, rien d'autre. Pas de markdown, pas de texte autour.\
"""

SCAN_TENNIS_PROMPT = """\
Tu es un analyste tennis professionnel. Recherche sur le web tous les matchs \
de tennis {leagues} prevus dans les {timeframe} prochaines heures/jours.

Pour CHAQUE match trouve, retourne les donnees suivantes en JSON.
Si une information n'est pas trouvable, mets null.

{{
  "matches": [
    {{
      "player1": "Djokovic N.",
      "player2": "Alcaraz C.",
      "tournament": "Indian Wells Masters",
      "surface": "Hard",
      "round": "QF",
      "date": "2026-03-07T20:00:00",
      "venue": "Indian Wells Tennis Garden",
      "indoor_outdoor": "Outdoor",
      "weather": "28C, ensoleille",
      "odds": {{
        "winner": {{
          "P1": {{"betclic": 2.10, "winamax": 2.08, "unibet": 2.12}},
          "P2": {{"betclic": 1.75, "winamax": 1.77, "unibet": 1.74}}
        }},
        "sets": {{"2-0": 2.80, "2-1": 3.50, "0-2": 3.20, "1-2": 4.50}},
        "total_games": {{"O22.5": 1.85, "U22.5": 1.95}},
        "handicap_games": {{"P1 -3.5": 2.10, "P2 +3.5": 1.75}}
      }},
      "p1_ranking": 3,
      "p2_ranking": 1,
      "p1_age": 37,
      "p2_age": 22,
      "p1_form": "VVVVD",
      "p2_form": "VVVVV",
      "p1_form_detail": ["d. Rune 6-3 6-4", "d. Fritz 7-5 3-6 6-2", "d. Tsitsipas 6-2 6-4", "d. Paul 7-6 6-3", "p. Sinner 4-6 3-6"],
      "p2_form_detail": ["d. Sinner 6-4 6-3", "d. Medvedev 7-6 6-4", "d. Rune 6-1 6-2", "d. Zverev 6-3 7-5", "d. Ruud 6-2 6-0"],
      "p1_season_record": "15-3",
      "p2_season_record": "20-1",
      "p1_surface_record": "15-3 (83%)",
      "p2_surface_record": "20-2 (91%)",
      "p1_serve_pct": 68,
      "p1_aces_avg": 8.5,
      "p1_df_avg": 2.1,
      "p1_first_serve_won": 78,
      "p1_return_pct": 42,
      "p1_break_points_converted": 42,
      "p2_serve_pct": 72,
      "p2_aces_avg": 6.2,
      "p2_df_avg": 1.8,
      "p2_first_serve_won": 81,
      "p2_return_pct": 45,
      "p2_break_points_converted": 48,
      "p1_rest_days": 2,
      "p2_rest_days": 3,
      "p1_matches_last14d": 5,
      "p2_matches_last14d": 4,
      "p1_injuries": "RAS",
      "p2_injuries": "Douleur genou droit (mineur)",
      "h2h": "3-5 (avantage P2)",
      "h2h_surface": "1-3 sur dur",
      "h2h_last3": ["P2 6-4 3-6 7-6 (US Open 2025)", "P2 7-5 6-3 (Wimbledon 2025)", "P1 6-3 6-4 (Roland Garros 2025)"],
      "h2h_avg_games": 24.5,
      "motivation": "P1 veut son 25e Grand Chelem, P2 domine le circuit",
      "context": "Alcaraz 5 victoires d'affilee, Djokovic revient de blessure"
    }}
  ]
}}

IMPORTANT: Mets TOUS les matchs trouves dans le tableau "matches". \
Si aucun match n'est prevu dans le delai exact, inclus les matchs les plus proches.

Sources : ATP Tour, WTA Tour, Flashscore, Betclic, Tennis Explorer, Sofascore.
Retourne UNIQUEMENT le JSON valide, rien d'autre. Pas de markdown, pas de texte autour.\
"""

DEEP_FOOTBALL_PROMPT = """\
Tu es un analyste sportif expert. Fais une recherche web approfondie sur le match :
{home_team} vs {away_team} - {competition} - {date}

Retourne en JSON TOUTES les informations suivantes.
Si une information n'est pas trouvable, mets null.

{{
  "match_info": {{
    "home_team": "{home_team}",
    "away_team": "{away_team}",
    "league": "{competition}",
    "date": "{date}",
    "venue": "...",
    "referee": "...",
    "referee_avg_cards": null,
    "referee_avg_fouls": null,
    "referee_penalty_tendency": null,
    "weather_forecast": "15C, couvert, vent faible",
    "motivation_home": "Vise le titre / maintien / Europe...",
    "motivation_away": "..."
  }},
  "odds": {{
    "1x2": {{"H": 0, "D": 0, "A": 0, "source": "Betclic"}},
    "over_under": {{"O0.5": 0, "U0.5": 0, "O1.5": 0, "U1.5": 0, "O2.5": 0, "U2.5": 0, "O3.5": 0, "U3.5": 0, "O4.5": 0, "U4.5": 0}},
    "btts": {{"yes": 0, "no": 0}},
    "double_chance": {{"1X": 0, "12": 0, "X2": 0}},
    "draw_no_bet": {{"H": 0, "A": 0}},
    "correct_score_top5": [{{"score": "1-0", "odds": 6.50}}],
    "half_time_result": {{"H": 0, "D": 0, "A": 0}},
    "handicap": {{"H-1": 0, "A+1": 0}},
    "corners_over_under": {{"O9.5": 0, "U9.5": 0}},
    "cards_over_under": {{"O3.5": 0, "U3.5": 0}},
    "odds_movement": "H en baisse (1.55->1.45), confiance croissante pour domicile",
    "bookmakers_compared": {{
      "betclic": {{"H": 0, "D": 0, "A": 0}},
      "winamax": {{"H": 0, "D": 0, "A": 0}},
      "unibet": {{"H": 0, "D": 0, "A": 0}},
      "bet365": {{"H": 0, "D": 0, "A": 0}}
    }}
  }},
  "home_team_analysis": {{
    "form_last5": ["V 2-0 vs Lens", "V 3-1 vs Nice", "V 1-0 vs Rennes", "N 1-1 vs Monaco", "D 0-2 vs Lyon"],
    "form_string": "VVVND",
    "form_home_last5": "VVVVV",
    "position": 1,
    "points": 65,
    "goals_scored": 58,
    "goals_conceded": 19,
    "goals_scored_home": 35,
    "goals_conceded_home": 7,
    "home_record": "12V 2N 0D",
    "ppg_last5": 2.4,
    "ppg_home": 2.7,
    "goals_scored_avg5": 2.2,
    "goals_conceded_avg5": 0.6,
    "clean_sheets_total": 12,
    "clean_sheets_last5": 3,
    "xg_avg": 2.1,
    "xg_against_avg": 0.9,
    "possession_avg": 62,
    "shots_per_game": 16.3,
    "shots_on_target_pg": 6.8,
    "corners_avg": 7.2,
    "cards_avg": 1.8,
    "fouls_avg": 11.5,
    "btts_pct": 55,
    "over25_pct": 70,
    "over15_pct": 85,
    "first_half_goals_avg": 0.9,
    "second_half_goals_avg": 1.3,
    "scored_first_pct": 65,
    "win_after_scoring_first": 85,
    "current_streak": "3 victoires",
    "unbeaten_run": 12,
    "rest_days": 4
  }},
  "away_team_analysis": {{
    "form_last5": ["N 0-0 vs Toulouse", "D 1-3 vs Lille", "V 2-1 vs Nantes", "V 3-0 vs Brest", "D 0-1 vs Strasbourg"],
    "form_string": "NDVVD",
    "form_away_last5": "NVDDV",
    "position": 8,
    "points": 38,
    "goals_scored": 35,
    "goals_conceded": 32,
    "goals_scored_away": 14,
    "goals_conceded_away": 18,
    "away_record": "5V 3N 6D",
    "ppg_last5": 1.6,
    "ppg_away": 1.2,
    "goals_scored_avg5": 1.4,
    "goals_conceded_avg5": 1.2,
    "clean_sheets_total": 6,
    "clean_sheets_last5": 1,
    "xg_avg": 1.3,
    "xg_against_avg": 1.4,
    "possession_avg": 48,
    "shots_per_game": 11.2,
    "shots_on_target_pg": 4.1,
    "corners_avg": 4.8,
    "cards_avg": 2.3,
    "fouls_avg": 13.2,
    "btts_pct": 65,
    "over25_pct": 60,
    "over15_pct": 80,
    "first_half_goals_avg": 0.6,
    "second_half_goals_avg": 0.8,
    "scored_first_pct": 40,
    "win_after_scoring_first": 70,
    "current_streak": "1 defaite",
    "unbeaten_run": 0,
    "rest_days": 3
  }},
  "injuries_suspensions": {{
    "home": [
      {{"player": "Dembele", "position": "AID", "status": "Suspendu 2 matchs", "impact": "Titulaire indiscutable", "goals_assists": "8 buts 6 passes"}}
    ],
    "away": []
  }},
  "expected_lineups": {{
    "home": {{
      "formation": "4-3-3",
      "xi": ["Donnarumma", "Hakimi", "Marquinhos", "Skriniar", "Mendes", "Vitinha", "Fabian Ruiz", "Zaaire-Emery", "Barcola", "Mbappe", "Lee"],
      "bench_key": ["Kolo Muani", "Ugarte", "Asensio"]
    }},
    "away": {{
      "formation": "3-4-3",
      "xi": [],
      "bench_key": []
    }}
  }},
  "h2h": {{
    "total_meetings": 50,
    "home_wins": 25,
    "draws": 12,
    "away_wins": 13,
    "avg_goals": 2.8,
    "btts_pct_h2h": 60,
    "over25_pct_h2h": 65,
    "last5": [
      {{"date": "2025-10-27", "score": "3-2", "competition": "Ligue 1", "venue": "Velodrome"}}
    ],
    "trend": "PSG 4 victoires sur les 5 derniers",
    "home_team_wins_at_home": "8 sur 10 derniers a domicile"
  }},
  "key_players": {{
    "home": [
      {{"name": "Mbappe", "goals": 22, "assists": 8, "rating": 8.2, "minutes": 2100, "form": "En grande forme, 5 buts en 3 matchs"}}
    ],
    "away": []
  }},
  "set_pieces": {{
    "home_goals_from_set_pieces": 12,
    "home_goals_conceded_set_pieces": 4,
    "away_goals_from_set_pieces": 8,
    "away_goals_conceded_set_pieces": 10,
    "home_penalty_won": 5,
    "away_penalty_won": 3
  }},
  "tactical_analysis": "PSG domine la possession et presse haut. OM dangereux en contre-attaque...",
  "expert_prediction": {{
    "predicted_score": "2-1",
    "confidence": "Moyenne",
    "best_bets": [
      {{"market": "1X2", "selection": "H", "odds": 1.45, "reasoning": "PSG invaincu a domicile, 12V en 14 matchs"}},
      {{"market": "O/U 2.5", "selection": "Over", "odds": 1.65, "reasoning": "3.2 buts/match en moyenne H2H, les 2 marquent souvent"}},
      {{"market": "BTTS", "selection": "Oui", "odds": 1.75, "reasoning": "OM a marque dans 80% de ses deplacements"}},
      {{"market": "Corners O/U", "selection": "Over 9.5", "odds": 1.90, "reasoning": "12 corners en moyenne dans les Classiques"}}
    ]
  }}
}}

Recherche sur : Betclic, Winamax, Unibet, Transfermarkt, FBref, L'Equipe, Flashscore, WhoScored, Sofascore.
Retourne UNIQUEMENT le JSON valide, rien d'autre. Pas de markdown, pas de texte autour.\
"""

DEEP_TENNIS_PROMPT = """\
Tu es un analyste tennis expert. Fais une recherche web approfondie sur le match :
{player1} vs {player2} - {tournament} - {date}

Retourne en JSON TOUTES les informations suivantes.
Si une information n'est pas trouvable, mets null.

{{
  "match_info": {{
    "player1": "{player1}",
    "player2": "{player2}",
    "tournament": "{tournament}",
    "round": null,
    "surface": null,
    "date": "{date}",
    "venue": null,
    "indoor_outdoor": null,
    "weather_forecast": null,
    "tournament_category": "Masters 1000 / Grand Slam / ATP 500 / etc."
  }},
  "odds": {{
    "winner": {{"P1": 0, "P2": 0, "source": "Betclic"}},
    "handicap_games": {{"P1 -3.5": 0, "P2 +3.5": 0, "P1 -4.5": 0, "P2 +4.5": 0}},
    "total_games": {{"O20.5": 0, "U20.5": 0, "O22.5": 0, "U22.5": 0, "O24.5": 0, "U24.5": 0}},
    "sets": {{"2-0": 0, "2-1": 0, "0-2": 0, "1-2": 0}},
    "first_set_winner": {{"P1": 0, "P2": 0}},
    "tiebreak_in_match": {{"yes": 0, "no": 0}},
    "odds_movement": "P1 en hausse (1.90->2.10), confiance pour P2 augmente",
    "bookmakers_compared": {{
      "betclic": {{"P1": 0, "P2": 0}},
      "winamax": {{"P1": 0, "P2": 0}},
      "unibet": {{"P1": 0, "P2": 0}},
      "bet365": {{"P1": 0, "P2": 0}}
    }}
  }},
  "player1_analysis": {{
    "ranking": 0,
    "age": 0,
    "height_cm": 188,
    "hand": "Droitier",
    "season_record": "0-0",
    "season_titles": 0,
    "surface_record_career": "0-0 (pct%)",
    "surface_record_season": "0-0",
    "tournament_record": "Meilleur resultat: ...",
    "form_last10": "VVVDVVVVDV",
    "recent_results": [
      {{"opponent": "Rune", "score": "6-3 6-4", "tournament": "Dubai", "round": "QF"}}
    ],
    "serve_stats": {{
      "first_serve_pct": 68,
      "first_serve_won": 78,
      "second_serve_won": 55,
      "aces_per_match": 8.5,
      "double_faults_per_match": 2.1,
      "service_games_won_pct": 88
    }},
    "return_stats": {{
      "first_return_won": 32,
      "second_return_won": 52,
      "break_points_converted": 42,
      "return_games_won_pct": 28
    }},
    "performance_stats": {{
      "tiebreaks_won_pct": 65,
      "deciding_sets_won_pct": 58,
      "sets_won_after_losing_first": 30,
      "avg_games_per_match": 22.5,
      "retirement_rate": 2
    }},
    "rest_days": 2,
    "matches_last14d": 5,
    "matches_last7d": 2,
    "travel_distance": "Meme continent / intercontinental",
    "fatigue_level": "Moyen - 5 matchs en 10 jours",
    "injuries": "RAS",
    "mental_form": "Confiant apres 5 victoires consecutives"
  }},
  "player2_analysis": {{
    "ranking": 0,
    "age": 0,
    "height_cm": 183,
    "hand": "Droitier",
    "season_record": "0-0",
    "season_titles": 0,
    "surface_record_career": "0-0 (pct%)",
    "surface_record_season": "0-0",
    "tournament_record": "...",
    "form_last10": "...",
    "recent_results": [],
    "serve_stats": {{
      "first_serve_pct": 0,
      "first_serve_won": 0,
      "second_serve_won": 0,
      "aces_per_match": 0,
      "double_faults_per_match": 0,
      "service_games_won_pct": 0
    }},
    "return_stats": {{
      "first_return_won": 0,
      "second_return_won": 0,
      "break_points_converted": 0,
      "return_games_won_pct": 0
    }},
    "performance_stats": {{
      "tiebreaks_won_pct": 0,
      "deciding_sets_won_pct": 0,
      "sets_won_after_losing_first": 0,
      "avg_games_per_match": 0,
      "retirement_rate": 0
    }},
    "rest_days": 0,
    "matches_last14d": 0,
    "matches_last7d": 0,
    "travel_distance": null,
    "fatigue_level": null,
    "injuries": "RAS",
    "mental_form": null
  }},
  "h2h": {{
    "total": 0,
    "p1_wins": 0,
    "p2_wins": 0,
    "on_surface": {{"p1": 0, "p2": 0}},
    "avg_games_per_match": 0,
    "tiebreaks_in_h2h": 0,
    "deciding_sets_in_h2h": 0,
    "last5": [
      {{"date": "2025-09-05", "score": "6-4 3-6 7-6", "tournament": "US Open", "surface": "Hard", "round": "SF"}}
    ],
    "trend": "P2 a gagne les 3 derniers sur dur",
    "momentum": "P1 domine recemment / P2 domine historiquement"
  }},
  "tactical_analysis": "Djokovic excellent en defense et en retour, Alcaraz agressif au filet et puissant en coup droit. Sur dur, Alcaraz impose son rythme. Djokovic excelle dans les echanges longs...",
  "expert_prediction": {{
    "predicted_score": "2-1",
    "confidence": "Elevee",
    "key_factors": [
      "Surface favorable a P2",
      "P1 fatigue (5 matchs en 10 jours)",
      "H2H favorable a P2 sur dur"
    ],
    "best_bets": [
      {{"market": "Winner", "selection": "P2", "odds": 1.75, "reasoning": "Alcaraz domine le H2H recent sur dur, meilleure forme"}},
      {{"market": "Total games", "selection": "Over 22.5", "odds": 1.85, "reasoning": "Leurs matchs sont toujours serres, 24.5 jeux en moyenne"}},
      {{"market": "Sets", "selection": "2-1 ou 1-2", "odds": 1.80, "reasoning": "6 de leurs 8 derniers matchs sont alles en 3 sets"}},
      {{"market": "First set winner", "selection": "P1", "odds": 2.05, "reasoning": "Djokovic tres fort en debut de match"}}
    ]
  }}
}}

Sources : ATP Tour, WTA Tour, Flashscore, Betclic, Tennis Explorer, Sofascore, Tennis Abstract.
Retourne UNIQUEMENT le JSON valide, rien d'autre. Pas de markdown, pas de texte autour.\
"""


# ---------------------------------------------------------------------------
# Claude Researcher
# ---------------------------------------------------------------------------

class ClaudeResearcher:
    """Call Claude Code CLI to research sports data via web search."""

    async def scan_matches(
        self,
        sport: str = "football",
        leagues: list[str] | None = None,
        timeframe: str = "48h",
        force: bool = False,
    ) -> dict:
        """General scan: list matches with odds and basic stats."""
        leagues_str = ", ".join(leagues) if leagues else "toutes les grandes ligues"

        if sport == "tennis":
            prompt = SCAN_TENNIS_PROMPT.format(
                leagues=leagues_str, timeframe=timeframe
            )
        else:
            prompt = SCAN_FOOTBALL_PROMPT.format(
                leagues=leagues_str, timeframe=timeframe
            )

        leagues_hash = hashlib.md5("_".join(sorted(leagues or ["all"])).encode()).hexdigest()[:8]
        cache_key = f"{sport}/scan_{leagues_hash}_{timeframe}_{datetime.now().strftime('%Y%m%d')}"
        return await self._call_claude(prompt, cache_key, CACHE_TTL_SCAN, force, model=SCAN_MODEL)

    async def deep_research(
        self,
        sport: str = "football",
        home: str = "",
        away: str = "",
        competition: str = "",
        date: str = "",
        force: bool = False,
    ) -> dict:
        """Deep research on a specific match."""
        if sport == "tennis":
            prompt = DEEP_TENNIS_PROMPT.format(
                player1=home, player2=away, tournament=competition, date=date
            )
        else:
            prompt = DEEP_FOOTBALL_PROMPT.format(
                home_team=home, away_team=away, competition=competition, date=date
            )

        slug_home = re.sub(r"[^a-z0-9]", "", home.lower())
        slug_away = re.sub(r"[^a-z0-9]", "", away.lower())
        # Sanitize date for Windows filenames (: and T are invalid)
        safe_date = re.sub(r"[^a-zA-Z0-9]", "", date)
        cache_key = f"{sport}/deep_{slug_home}_{slug_away}_{safe_date}"
        return await self._call_claude(prompt, cache_key, CACHE_TTL_DEEP, force, model=DEEP_MODEL)

    async def _call_claude(
        self, prompt: str, cache_key: str, ttl: int, force: bool, model: str = "sonnet"
    ) -> dict:
        """Call claude CLI subprocess with file-based cache."""
        cache_file = CACHE_DIR / f"{cache_key}.json"

        # Check cache
        if not force and cache_file.exists():
            try:
                data = json.loads(cache_file.read_text(encoding="utf-8"))
                cached_at = data.get("_cached_at", 0)
                if time.time() - cached_at < ttl:
                    logger.info("Cache hit: %s", cache_key)
                    data["_from_cache"] = True
                    return data
            except (json.JSONDecodeError, KeyError):
                pass

        logger.info("Calling Claude CLI for: %s", cache_key)
        start = time.time()

        def _run_claude(prompt_text: str) -> subprocess.CompletedProcess:
            cmd = [
                *CLAUDE_BASE_CMD,
                "-p", prompt_text,
                "--output-format", "json",
                "--model", model,
                "--allowedTools", "WebSearch", "WebFetch",
                "--max-budget-usd", "5",
            ]
            return subprocess.run(
                cmd,
                capture_output=True, timeout=CLAUDE_TIMEOUT,
                shell=CLAUDE_USE_SHELL,
            )

        try:
            loop = asyncio.get_event_loop()
            proc = await loop.run_in_executor(
                None, partial(_run_claude, prompt)
            )
        except subprocess.TimeoutExpired:
            logger.error("Claude CLI timed out after %ds", CLAUDE_TIMEOUT)
            return {"matches": [], "_error": "timeout"}
        except FileNotFoundError:
            logger.error("claude CLI not found in PATH")
            return {"matches": [], "_error": "claude_not_found"}

        duration = round(time.time() - start, 1)
        logger.info("Claude CLI responded in %.1fs", duration)

        if proc.returncode != 0:
            err = proc.stderr.decode(errors="replace").strip()
            logger.error("Claude CLI error (code %d): %s", proc.returncode, err[:500])
            return {"matches": [], "_error": err[:500]}

        raw = proc.stdout.decode(errors="replace").strip()
        logger.info("Claude raw response length: %d chars", len(raw))
        if not raw:
            err_out = proc.stderr.decode(errors="replace").strip()
            logger.error("Empty stdout from Claude. stderr: %s", err_out[:500])
            return {"matches": [], "_error": f"empty_response: {err_out[:200]}"}

        # Parse response — Claude may return JSON wrapped in markdown code blocks
        result = self._extract_json(raw)
        if result is None:
            logger.error("Failed to parse Claude response as JSON. First 500: %s", raw[:500])
            return {"matches": [], "_error": "json_parse_failed"}

        # Merge matches from alternative keys (Claude sometimes splits by competition)
        main_matches = result.get("matches", [])
        for key, val in list(result.items()):
            if key == "matches" or key.startswith("_"):
                continue
            if isinstance(val, list) and val and isinstance(val[0], dict):
                # Looks like a list of match objects
                if any(k in val[0] for k in ("home_team", "away_team", "player1", "player2")):
                    main_matches.extend(val)
        result["matches"] = main_matches

        # Add metadata
        result["_cached_at"] = time.time()
        result["_duration_seconds"] = duration
        result["_from_cache"] = False

        # Save cache
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        return result

    def _extract_json(self, raw: str) -> dict | None:
        """Extract JSON from Claude response, handling wrapper and markdown blocks.

        Claude --output-format json returns: {"type":"result","result":"<text with json>"}
        The actual data is in the "result" field, often wrapped in ```json blocks.
        """
        # Step 1: Parse outer JSON
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = None

        # Step 2: If it's a Claude CLI wrapper, extract the inner result
        if isinstance(data, dict) and data.get("type") == "result":
            # Check for error responses (budget exceeded, etc.)
            subtype = data.get("subtype", "")
            if subtype and subtype != "success":
                logger.warning("Claude returned non-success subtype: %s", subtype)

            if "result" in data:
                inner = data["result"]
                if isinstance(inner, dict):
                    return inner
                if isinstance(inner, str):
                    # Recursively extract from the inner string
                    extracted = self._extract_json_from_text(inner)
                    if extracted is not None:
                        return extracted

        # Step 3: If direct parse gave us a dict with "matches" (or other expected keys), use it
        if isinstance(data, dict) and ("matches" in data or "match_info" in data):
            return data

        # Step 4: Try extracting from raw text (no valid JSON wrapper)
        if data is None:
            return self._extract_json_from_text(raw)

        return None

    def _extract_json_from_text(self, text: str) -> dict | None:
        """Extract JSON object from text that may contain markdown code blocks."""
        # Try direct parse
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try to find JSON in markdown code blocks
        patterns = [
            r"```json\s*\n(.*?)```",
            r"```\s*\n(.*?)```",
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(1).strip())
                except json.JSONDecodeError:
                    continue

        # Last resort: find outermost { ... }
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

        return None
