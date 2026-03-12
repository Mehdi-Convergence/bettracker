RUGBY_LEAGUES = {
    61:  "Top 14",
    45:  "Premiership",
    111: "URC",
    21:  "Champions Cup",
}

RUGBY_SEASONS = [2019, 2020, 2021, 2022, 2023, 2024]

# Rugby point values
RUGBY_POINTS = {
    "try": 5,
    "conversion": 2,
    "penalty": 3,
    "drop_goal": 3,
}


FOOTBALL_LEAGUES = {
    # Top 5 leagues
    "E0": "Premier League",
    "F1": "Ligue 1",
    "I1": "Serie A",
    "D1": "Bundesliga",
    "SP1": "La Liga",
    "N1": "Eredivisie",
    # Second divisions (more daily coverage)
    "E1": "Championship",
    "D2": "2. Bundesliga",
    "I2": "Serie B",
    "SP2": "Segunda Division",
    "F2": "Ligue 2",
    # Other top leagues
    "P1": "Liga Portugal",
    "B1": "Jupiler League",
    "T1": "Super Lig",
    "G1": "Super League Greece",
    "SC0": "Scottish Premiership",
}

FOOTBALL_SEASONS = ["1819", "1920", "2021", "2122", "2223", "2324", "2425"]

FOOTBALL_DATA_BASE_URL = "https://www.football-data.co.uk/mmz4281"  # canonical: also in config.py

# Column mapping: CSV column name -> DB column name
FOOTBALL_COLUMN_MAP = {
    "Div": "league",
    "Date": "date",
    "HomeTeam": "home_team",
    "AwayTeam": "away_team",
    "FTHG": "fthg",
    "FTAG": "ftag",
    "FTR": "ftr",
    "HTHG": "hthg",
    "HTAG": "htag",
    "HS": "home_shots",
    "AS": "away_shots",
    "HST": "home_shots_target",
    "AST": "away_shots_target",
    "HC": "home_corners",
    "AC": "away_corners",
    "HF": "home_fouls",
    "AF": "away_fouls",
    "HY": "home_yellow",
    "AY": "away_yellow",
    "HR": "home_red",
    "AR": "away_red",
    # Pinnacle odds (sharpest market) - preferred
    "PSH": "odds_home",
    "PSD": "odds_draw",
    "PSA": "odds_away",
    # Pinnacle closing odds (for CLV)
    "PSCH": "odds_home_close",
    "PSCD": "odds_draw_close",
    "PSCA": "odds_away_close",
    # Max odds across bookmakers
    "MaxH": "max_odds_home",
    "MaxD": "max_odds_draw",
    "MaxA": "max_odds_away",
    # Average odds across bookmakers
    "AvgH": "avg_odds_home",
    "AvgD": "avg_odds_draw",
    "AvgA": "avg_odds_away",
}

# Fallback: if Pinnacle not available, use Bet365
FOOTBALL_ODDS_FALLBACK = {
    "B365H": "odds_home",
    "B365D": "odds_draw",
    "B365A": "odds_away",
}

# Season code to display name
SEASON_DISPLAY = {
    "1819": "2018/19",
    "1920": "2019/20",
    "2021": "2020/21",
    "2122": "2021/22",
    "2223": "2022/23",
    "2324": "2023/24",
    "2425": "2024/25",
}
