"""Pydantic schemas for API request/response models."""

from datetime import datetime

from pydantic import BaseModel, Field


# --- Match schemas ---


class MatchResponse(BaseModel):
    id: int
    season: str
    league: str
    date: str
    home_team: str
    away_team: str
    fthg: int
    ftag: int
    ftr: str
    odds_home: float | None = None
    odds_draw: float | None = None
    odds_away: float | None = None


class UpcomingMatchResponse(BaseModel):
    match_id: str | None = None
    home_team: str
    away_team: str
    league: str
    date: str
    odds: dict  # {"H": {"pinnacle": 1.85, ...}, "D": {...}, "A": {...}}
    prediction: dict | None = None  # {"H": 0.45, "D": 0.28, "A": 0.27}
    value_bet: dict | None = None  # best value bet if any


# --- Combo schemas ---


class ComboLegRequest(BaseModel):
    home_team: str
    away_team: str
    league: str
    date: str
    outcome: str = Field(pattern="^[HDA]$")
    odds: float = Field(gt=1.0)
    model_prob: float = Field(ge=0.0, le=1.0)


class ComboGenerateRequest(BaseModel):
    legs: list[ComboLegRequest]
    max_legs: int = Field(default=4, ge=2, le=6)
    min_combo_odds: float = Field(default=1.8, gt=1.0)
    max_combo_odds: float = Field(default=3.0, gt=1.0)
    min_leg_prob: float = Field(default=0.50, ge=0.0, le=1.0)
    top_n: int = Field(default=10, ge=1, le=50)


class ComboLegResponse(BaseModel):
    match: str
    league: str
    outcome: str
    odds: float
    model_prob: float


class ComboResponse(BaseModel):
    legs: list[ComboLegResponse]
    num_legs: int
    combined_odds: float
    combined_prob: float
    ev: float
    potential_gain_per_unit: float  # gain for 1 unit stake


class ComboSimulateRequest(BaseModel):
    legs: list[ComboLegRequest]
    stake: float = Field(default=10.0, gt=0)


class ComboSimulateResponse(BaseModel):
    combined_odds: float
    combined_prob: float
    ev: float
    stake: float
    potential_gain: float
    num_legs: int


# --- Backtest schemas ---


class BacktestRequest(BaseModel):
    initial_bankroll: float = Field(default=200.0, gt=0)
    flat_stake: float = Field(default=0.05, gt=0, le=0.5)
    min_edge: float = Field(default=0.02, ge=0)
    min_model_prob: float | None = Field(default=0.55)
    max_odds: float | None = None
    min_odds: float | None = None
    allowed_outcomes: list[str] | None = None
    excluded_leagues: list[str] | None = None
    combo_mode: bool = False
    combo_max_legs: int = Field(default=4, ge=2, le=6)
    combo_min_odds: float = Field(default=1.8, gt=1.0)
    combo_max_odds: float = Field(default=3.0, gt=1.0)
    combo_top_n: int = Field(default=3, ge=1, le=10)
    test_seasons: list[str] = Field(default=["2324", "2425"])


class BacktestBetResponse(BaseModel):
    date: str
    match: str
    league: str
    outcome_bet: str
    model_prob: float
    odds: float
    stake: float
    won: bool
    pnl: float
    bankroll_after: float
    num_legs: int | None = None


class BacktestMetricsResponse(BaseModel):
    total_bets: int
    wins: int
    losses: int
    win_rate: float
    total_staked: float
    total_pnl: float
    roi_pct: float
    final_bankroll: float
    bankroll_growth_pct: float
    max_drawdown_pct: float
    longest_losing_streak: int
    longest_winning_streak: int
    avg_edge: float
    avg_odds: float
    avg_clv: float | None = None


class BacktestResponse(BaseModel):
    metrics: BacktestMetricsResponse
    bets: list[BacktestBetResponse]
    bankroll_curve: list[float]
    config: dict


# --- Portfolio schemas ---


class BetCreateRequest(BaseModel):
    home_team: str
    away_team: str
    league: str
    match_date: str
    outcome_bet: str = Field(pattern="^[HDA]$")
    odds_at_bet: float = Field(gt=1.0)
    stake: float = Field(gt=0)
    is_combo: bool = False
    combo_legs: list[dict] | None = None
    campaign_id: int | None = None


class BetResponse(BaseModel):
    id: int
    home_team: str
    away_team: str
    league: str
    match_date: str
    outcome_bet: str
    odds_at_bet: float
    stake: float
    result: str
    profit_loss: float | None = None
    campaign_id: int | None = None
    created_at: str


class PortfolioStatsResponse(BaseModel):
    total_bets: int
    pending_bets: int
    won: int
    lost: int
    win_rate: float
    total_staked: float
    total_pnl: float
    roi_pct: float
    longest_winning_streak: int
    longest_losing_streak: int


class BankrollPointResponse(BaseModel):
    date: str
    bankroll: float


# --- Scanner schemas ---


class ScanRequest(BaseModel):
    min_prob: float | None = None
    max_odds: float | None = None
    min_odds: float | None = None
    min_edge: float | None = None
    outcomes: list[str] | None = None
    leagues: list[str] | None = None


class ValueBetResponse(BaseModel):
    home_team: str
    away_team: str
    league: str
    date: str
    outcome: str
    model_prob: float
    implied_prob: float
    edge: float
    best_odds: float
    bookmaker: str


class OutcomeDetail(BaseModel):
    outcome: str
    best_odds: float
    best_bookmaker: str
    all_odds: dict[str, float]  # bookmaker → odds (toutes les cotes dispo)
    model_prob: float
    implied_prob: float
    edge: float
    is_value: bool


class MatchCardResponse(BaseModel):
    home_team: str
    away_team: str
    league: str
    date: str
    outcomes: dict[str, OutcomeDetail]
    best_value_outcome: str | None
    best_edge: float


class ScanResponse(BaseModel):
    matches: list[MatchCardResponse]
    value_bets: list[ValueBetResponse]
    total_matches_scanned: int
    api_quota_remaining: int | None
    cached: bool = False
    cached_at: str | None = None


# --- Multi-Market schemas (Betclic) ---


class MarketSelection(BaseModel):
    name: str
    odds: float
    bookmaker: str = "betclic"
    all_odds: dict[str, float] = {}
    model_prob: float | None = None
    implied_prob: float = 0.0
    edge: float | None = None


class MarketData(BaseModel):
    market_type: str
    market_name: str
    selections: list[MarketSelection]


class MatchWithMarkets(BaseModel):
    home_team: str
    away_team: str
    league: str
    league_name: str = ""
    date: str
    is_live: bool = False
    score: dict | None = None
    timer: str = ""
    url: str = ""
    markets: list[MarketData]
    outcomes: dict[str, OutcomeDetail] = {}
    best_value_outcome: str | None = None
    best_edge: float = 0.0


class MultiMarketScanResponse(BaseModel):
    matches: list[MatchWithMarkets]
    total_matches_scanned: int
    source: str = "betclic"
    cached: bool = False
    cached_at: str | None = None
    api_quota_remaining: int | None = None


# --- Match Detail schemas ---


class TeamFormEntry(BaseModel):
    date: str
    opponent: str
    venue: str  # "home" or "away"
    goals_for: int
    goals_against: int
    result: str  # "W", "D", "L"
    league: str


class TeamFormStats(BaseModel):
    team_name: str
    elo_rating: float
    league_position: int
    recent_matches: list[TeamFormEntry]
    ppg_5: float
    ppg_10: float
    goals_scored_avg_5: float
    goals_conceded_avg_5: float
    goal_diff_avg_5: float
    home_or_away_form_5: float
    current_streak: str
    win_streak: int
    unbeaten_run: int
    clean_sheets_5: int
    failed_to_score_5: int
    shots_avg_5: float | None = None
    shots_on_target_avg_5: float | None = None
    shot_accuracy_5: float | None = None
    rest_days: float | None = None


class H2HMatch(BaseModel):
    date: str
    home_team: str
    away_team: str
    fthg: int
    ftag: int
    ftr: str
    league: str
    season: str


class H2HStats(BaseModel):
    total_meetings: int
    home_team_wins: int
    draws: int
    away_team_wins: int
    avg_goals: float
    home_win_rate: float
    draw_rate: float
    recent_matches: list[H2HMatch]


class KeyFeature(BaseModel):
    name: str
    value: float
    description: str
    direction: str  # "positive" (favors home), "negative" (favors away), "neutral"


class ModelAnalysis(BaseModel):
    prob_home: float
    prob_draw: float
    prob_away: float
    predicted_outcome: str
    confidence: float
    key_features: list[KeyFeature]
    edge_home: float | None = None
    edge_draw: float | None = None
    edge_away: float | None = None


class HistoricalAverages(BaseModel):
    home_shots_avg: float | None = None
    home_shots_target_avg: float | None = None
    home_corners_avg: float | None = None
    home_fouls_avg: float | None = None
    home_yellow_avg: float | None = None
    away_shots_avg: float | None = None
    away_shots_target_avg: float | None = None
    away_corners_avg: float | None = None
    away_fouls_avg: float | None = None
    away_yellow_avg: float | None = None


class MatchDetailResponse(BaseModel):
    home_team: str
    away_team: str
    league: str
    league_name: str
    date: str
    home_form: TeamFormStats
    away_form: TeamFormStats
    h2h: H2HStats
    model: ModelAnalysis
    historical: HistoricalAverages


class MatchDetailRequest(BaseModel):
    home_team: str
    away_team: str
    league: str
    date: str


# --- Campaign schemas ---


class CampaignCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    initial_bankroll: float = Field(default=200.0, gt=0)
    flat_stake: float = Field(default=0.05, gt=0, le=0.5)
    min_edge: float = Field(default=0.02, ge=0)
    min_model_prob: float | None = Field(default=0.55)
    min_odds: float | None = None
    max_odds: float | None = None
    allowed_outcomes: list[str] | None = None
    excluded_leagues: list[str] | None = None
    combo_mode: bool = False
    combo_max_legs: int = Field(default=4, ge=2, le=6)
    combo_min_odds: float = Field(default=1.8, gt=1.0)
    combo_max_odds: float = Field(default=3.0, gt=1.0)
    combo_top_n: int = Field(default=3, ge=1, le=10)
    target_bankroll: float | None = None


class CampaignUpdateRequest(BaseModel):
    name: str | None = None
    status: str | None = None
    flat_stake: float | None = None
    min_edge: float | None = None
    min_model_prob: float | None = None
    min_odds: float | None = None
    max_odds: float | None = None
    allowed_outcomes: list[str] | None = None
    excluded_leagues: list[str] | None = None
    target_bankroll: float | None = None


class CampaignResponse(BaseModel):
    id: int
    name: str
    status: str
    initial_bankroll: float
    flat_stake: float
    min_edge: float
    min_model_prob: float | None
    min_odds: float | None
    max_odds: float | None
    allowed_outcomes: list[str] | None
    excluded_leagues: list[str] | None
    combo_mode: bool
    combo_max_legs: int
    combo_min_odds: float
    combo_max_odds: float
    combo_top_n: int
    target_bankroll: float | None
    created_at: str


class CampaignStatsResponse(BaseModel):
    total_bets: int
    pending_bets: int
    won: int
    lost: int
    win_rate: float
    total_staked: float
    total_pnl: float
    roi_pct: float
    current_bankroll: float
    longest_winning_streak: int
    longest_losing_streak: int


class CampaignDetailResponse(BaseModel):
    campaign: CampaignResponse
    stats: CampaignStatsResponse


class CampaignRecommendation(BaseModel):
    home_team: str
    away_team: str
    league: str
    date: str
    outcome: str
    model_prob: float
    implied_prob: float
    edge: float
    best_odds: float
    bookmaker: str
    suggested_stake: float


class CampaignRecommendationsResponse(BaseModel):
    campaign_id: int
    current_bankroll: float
    recommendations: list[CampaignRecommendation]
    total_scanned: int


class CampaignAcceptRequest(BaseModel):
    home_team: str
    away_team: str
    league: str
    match_date: str
    outcome: str = Field(pattern="^[HDA]$")
    odds: float = Field(gt=1.0)
    stake: float = Field(gt=0)


# --- Player data schemas (scraped from Transfermarkt) ---


class PlayerInjury(BaseModel):
    player: str
    position: str
    injury: str
    since: str
    expected_return: str


class PlayerSeasonStat(BaseModel):
    player: str
    position: str
    appearances: int
    goals: int
    assists: int
    minutes: int
    yellow_cards: int
    red_cards: int


class TeamPlayersResponse(BaseModel):
    team_name: str
    injuries: list[PlayerInjury]
    players: list[PlayerSeasonStat]
    scraped_at: str | None = None
    available: bool = True
    error: str | None = None


# --- AI Research schemas (Claude Code powered) ---


class AIScanMatch(BaseModel):
    """Match returned by AI scan."""
    # Football
    home_team: str | None = None
    away_team: str | None = None
    # Tennis
    player1: str | None = None
    player2: str | None = None
    # Common
    sport: str = "football"
    league: str = ""
    date: str = ""
    venue: str | None = None
    odds: dict = {}
    form_home: str | None = None
    form_away: str | None = None
    form_home_detail: list[str] = []
    form_away_detail: list[str] = []
    form_home_home: str | None = None       # football: home form at home
    form_away_away: str | None = None       # football: away form away
    position_home: int | None = None
    position_away: int | None = None
    key_absences_home: list[str] = []
    key_absences_away: list[str] = []
    h2h_summary: str | None = None
    h2h_avg_goals: float | None = None
    context: str | None = None
    motivation: str | None = None
    referee: str | None = None
    weather: str | None = None
    # Football enriched stats
    home_goals_scored: int | None = None
    home_goals_conceded: int | None = None
    away_goals_scored: int | None = None
    away_goals_conceded: int | None = None
    home_goals_scored_avg5: float | None = None
    home_goals_conceded_avg5: float | None = None
    away_goals_scored_avg5: float | None = None
    away_goals_conceded_avg5: float | None = None
    home_xg_avg: float | None = None
    away_xg_avg: float | None = None
    home_clean_sheets: int | None = None
    away_clean_sheets: int | None = None
    home_btts_pct: int | None = None
    away_btts_pct: int | None = None
    home_over25_pct: int | None = None
    away_over25_pct: int | None = None
    home_corners_avg: float | None = None
    away_corners_avg: float | None = None
    home_cards_avg: float | None = None
    away_cards_avg: float | None = None
    home_possession_avg: int | None = None
    away_possession_avg: int | None = None
    home_shots_pg: float | None = None
    away_shots_pg: float | None = None
    home_rest_days: int | None = None
    away_rest_days: int | None = None
    home_current_streak: str | None = None
    away_current_streak: str | None = None
    home_top_scorer: str | None = None
    away_top_scorer: str | None = None
    # Tennis specific
    surface: str | None = None
    round: str | None = None
    ranking_p1: int | None = None
    ranking_p2: int | None = None
    p1_age: int | None = None
    p2_age: int | None = None
    p1_season_record: str | None = None
    p2_season_record: str | None = None
    p1_surface_record: str | None = None
    p2_surface_record: str | None = None
    p1_serve_pct: int | None = None
    p2_serve_pct: int | None = None
    p1_return_pct: int | None = None
    p2_return_pct: int | None = None
    p1_aces_avg: float | None = None
    p2_aces_avg: float | None = None
    p1_rest_days: int | None = None
    p2_rest_days: int | None = None
    h2h_surface: str | None = None
    h2h_last3: list[str] = []
    # Lineup
    fixture_id: int | None = None
    lineup_status: str = "unavailable"     # "presumed" | "confirmed" | "unavailable"
    lineup_home: list[dict] = []           # [{name, pos, number}]
    lineup_away: list[dict] = []
    # H2H structured
    h2h_details: list[dict] = []           # [{date, home_name, away_name, score_h, score_a, winner_id}]
    # Key players (top scorers + absence flag)
    key_players_home: list[dict] = []      # [{name, goals, assists, goals_per_match, rating, is_absent}]
    key_players_away: list[dict] = []
    # Computed by probability_calculator
    model_prob_home: float | None = None   # estimated prob home/P1
    model_prob_draw: float | None = None   # estimated prob draw (football only)
    model_prob_away: float | None = None   # estimated prob away/P2
    edges: dict = {}                       # H/D/A or P1/P2 -> edge value
    data_quality: str = "red"              # "green" | "yellow" | "red"
    data_score: float = 0.0               # 0-1 ratio of available data
    lambda_home: float | None = None       # Poisson lambda home
    lambda_away: float | None = None       # Poisson lambda away


class AIScanResponse(BaseModel):
    """Response from AI scan endpoint."""
    matches: list[AIScanMatch]
    sport: str = "football"
    source: str = "claude_code"
    cached: bool = False
    cached_at: str | None = None
    research_duration_seconds: float = 0.0


class AIResearchResponse(BaseModel):
    """Deep research response for a single match."""
    sport: str = "football"
    match_info: dict = {}
    odds: dict = {}
    home_analysis: dict = {}
    away_analysis: dict = {}
    injuries: dict = {}
    lineups: dict | None = None
    h2h: dict = {}
    key_players: dict | None = None
    tactical_analysis: str = ""
    expert_prediction: dict = {}
    cached: bool = False
    cached_at: str | None = None
    research_duration_seconds: float = 0.0
