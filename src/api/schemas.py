"""Pydantic schemas for API request/response models."""

import re
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator


def _check_password_strength(v: str) -> str:
    """Shared password complexity check."""
    if not re.search(r"[A-Z]", v):
        raise ValueError("Le mot de passe doit contenir au moins une majuscule")
    if not re.search(r"[a-z]", v):
        raise ValueError("Le mot de passe doit contenir au moins une minuscule")
    if not re.search(r"\d", v):
        raise ValueError("Le mot de passe doit contenir au moins un chiffre")
    return v


# --- Auth schemas ---


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)

    @field_validator("password")
    @classmethod
    def check_password_strength(cls, v: str) -> str:
        return _check_password_strength(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str
    tier: str
    is_active: bool
    trial_ends_at: str | None = None
    created_at: str
    onboarding_completed: bool = False
    visited_modules: list[str] = []


class OnboardingRequest(BaseModel):
    bankroll: float = Field(gt=0)
    default_stake_pct: float = Field(gt=0, le=100)


class TourVisitedRequest(BaseModel):
    module: str = Field(min_length=1, max_length=50)


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_password_strength(cls, v: str) -> str:
        return _check_password_strength(v)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_password_strength(cls, v: str) -> str:
        return _check_password_strength(v)


class MessageResponse(BaseModel):
    message: str


class UserStatsResponse(BaseModel):
    total_bets: int
    roi_pct: float
    member_since: str
    is_active: bool


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
    initial_bankroll: float = Field(default=500.0, gt=0)
    # Staking strategy: "flat" | "half_kelly" | "pct_bankroll" | "kelly_dynamic"
    staking_strategy: str = Field(default="half_kelly")
    flat_stake_amount: float | None = Field(default=None)  # € amount for flat mode
    pct_bankroll: float = Field(default=0.02, gt=0, le=0.2)  # % of bankroll for pct mode
    kelly_fraction: float = Field(default=0.5, gt=0, le=1.0)
    max_stake_pct: float = Field(default=0.10, gt=0, le=0.5)
    min_edge: float = Field(default=0.05, ge=0)
    min_model_prob: float | None = Field(default=0.55)
    max_odds: float | None = None
    min_odds: float | None = None
    allowed_outcomes: list[str] | None = None
    excluded_leagues: list[str] | None = None
    # Stop loss
    stop_loss_daily_pct: float | None = None  # e.g. 0.15 = 15%
    stop_loss_total_pct: float | None = None  # e.g. 0.40 = 40%
    # Combo
    combo_mode: bool = False
    combo_max_legs: int = Field(default=4, ge=2, le=6)
    combo_min_odds: float = Field(default=1.8, gt=1.0)
    combo_max_odds: float = Field(default=3.0, gt=1.0)
    combo_top_n: int = Field(default=3, ge=1, le=10)
    # Period
    test_seasons: list[str] = Field(default=["2324", "2425"])
    sport: str = Field(default="football")


class BacktestBetResponse(BaseModel):
    date: str
    match: str
    league: str | None = None
    outcome_bet: str
    model_prob: float
    odds: float
    stake: float
    won: bool
    pnl: float
    bankroll_after: float
    edge: float = 0.0
    clv: float | None = None
    num_legs: int | None = None
    # Tennis-specific
    tournament: str | None = None
    surface: str | None = None


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
    avg_ev_per_bet: float = 0.0  # EV moyen par pari


class BacktestResponse(BaseModel):
    metrics: BacktestMetricsResponse
    bets: list[BacktestBetResponse]
    bankroll_curve: list[float]
    config: dict


class SaveBacktestRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    sport: str = Field(default="football")
    params: dict  # original BacktestRequest as dict
    metrics: dict  # BacktestMetricsResponse as dict
    bets: list[dict]  # list of BacktestBetResponse as dicts
    bankroll_curve: list[float]
    config: dict


class SavedBacktestResponse(BaseModel):
    id: int
    name: str
    sport: str
    params: dict
    metrics: dict
    bets: list[dict]
    bankroll_curve: list[float]
    config: dict
    created_at: str


class SavedBacktestSummary(BaseModel):
    id: int
    name: str
    sport: str
    roi_pct: float
    total_bets: int
    created_at: str


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
    bookmaker: str | None = None
    note: str | None = None


class BetResponse(BaseModel):
    id: int
    sport: str
    home_team: str
    away_team: str
    league: str
    match_date: str
    outcome_bet: str
    odds_at_bet: float
    odds_at_close: float | None = None
    stake: float
    result: str
    profit_loss: float | None = None
    clv: float | None = None
    campaign_id: int | None = None
    combo_group: str | None = None
    source: str | None = None
    bookmaker: str | None = None
    edge_at_bet: float | None = None
    note: str | None = None
    campaign_version: int | None = None
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
    prev_roi_pct: float | None = None
    prev_total_staked: float | None = None
    prev_win_rate: float | None = None
    prev_total_bets: int | None = None
    sport_breakdown: list[dict] | None = None  # [{sport, won, lost, pnl, staked, roi_pct}]
    bookmaker_breakdown: list[dict] = []  # [{bookmaker, total_bets, won, lost, roi_pct, total_pnl}]
    league_breakdown: list[dict] = []  # [{league, total_bets, won, lost, roi_pct, total_pnl}]
    market_breakdown: list[dict] = []  # [{market, total_bets, won, lost, roi_pct}]


class PortfolioHistoryPoint(BaseModel):
    date: str
    cumulative_pnl: float
    roi_pct: float


class CampaignSummaryItem(BaseModel):
    id: int
    name: str
    total_bets: int
    won: int
    lost: int
    pending: int
    roi_pct: float


class DashboardSummaryResponse(BaseModel):
    active_campaigns: int
    pending_bets: int
    recent_results: dict  # {"won": int, "lost": int}
    campaign_summaries: list[CampaignSummaryItem] = []


class BankrollPointResponse(BaseModel):
    date: str
    bankroll: float




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
    avg_clv: float | None = None
    max_drawdown_pct: float = 0.0
    max_drawdown_amount: float = 0.0
    ev_expected: float = 0.0
    algo_stats: dict | None = None
    manual_stats: dict | None = None


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


class BetUpdateRequest(BaseModel):
    result: str = Field(pattern="^(won|lost|void|pending)$")


class BetNoteUpdateRequest(BaseModel):
    note: str = Field(max_length=500)


class CampaignAcceptRequest(BaseModel):
    home_team: str = Field(min_length=1)
    away_team: str = Field(min_length=1)
    league: str = Field(min_length=1)
    match_date: str
    outcome: str = Field(pattern="^[HDA]$")
    odds: float = Field(gt=1.0)
    stake: float = Field(gt=0)


# --- AI Scanner schemas ---


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
    form_home_detail: list[Any] = []
    form_away_detail: list[Any] = []
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
    home_btts_pct: float | None = None
    away_btts_pct: float | None = None
    home_over25_pct: float | None = None
    away_over25_pct: float | None = None
    home_corners_avg: float | None = None
    away_corners_avg: float | None = None
    home_cards_avg: float | None = None
    away_cards_avg: float | None = None
    home_red_cards_pg: float | None = None
    away_red_cards_pg: float | None = None
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
    # BTTS and Over2.5 model probabilities + edges
    btts_model_prob: float | None = None
    over25_model_prob: float | None = None
    btts_edge: float | None = None
    over25_edge: float | None = None
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
    p1_serve_pct: float | None = None
    p2_serve_pct: float | None = None
    p1_return_pct: float | None = None
    p2_return_pct: float | None = None
    p1_aces_avg: float | None = None
    p2_aces_avg: float | None = None
    p1_rest_days: int | None = None
    p2_rest_days: int | None = None
    # Historical service stats from Tennis Abstract (rolling avg 5 matches)
    p1_serve_stats: dict | None = None  # {ace_rate, df_rate, 1st_serve_in, 1st_serve_won, 2nd_serve_won, bp_save}
    p2_serve_stats: dict | None = None
    tennis_ml_used: bool = False
    # NBA fields
    nba_ml_used: bool = False
    home_win_rate_10: float | None = None
    away_win_rate_10: float | None = None
    home_pt_diff_10: float | None = None
    away_pt_diff_10: float | None = None
    home_pts_avg_10: float | None = None
    away_pts_avg_10: float | None = None
    home_pts_allowed_10: float | None = None
    away_pts_allowed_10: float | None = None
    home_b2b: bool = False
    away_b2b: bool = False
    home_streak: int | None = None
    away_streak: int | None = None
    odds_over: float | None = None
    odds_under: float | None = None
    total_line: float | None = None
    h2h_surface: str | None = None
    h2h_last3: list[str] = []
    # Rugby fields
    rugby_ml_used: bool = False
    home_tries_avg_10: float | None = None
    away_tries_avg_10: float | None = None
    home_penalties_avg_10: float | None = None
    away_penalties_avg_10: float | None = None
    # MLB fields
    mlb_ml_used: bool = False
    home_runs_avg_10: float | None = None
    away_runs_avg_10: float | None = None
    home_runs_allowed_10: float | None = None
    away_runs_allowed_10: float | None = None
    starter_home_name: str | None = None
    starter_away_name: str | None = None
    # Lineup
    fixture_id: int | None = None
    lineup_status: str = "unavailable"     # "presumed" | "confirmed" | "unavailable"
    lineup_home: list[dict] = []           # [{name, pos, number, goals, assists, rating, games, is_absent}]
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


# --- Campaign Version schemas ---


class CampaignVersionResponse(BaseModel):
    id: int
    campaign_id: int
    version: int
    snapshot: dict
    changed_at: str
    change_summary: str


class CampaignVersionListResponse(BaseModel):
    versions: list[CampaignVersionResponse]
    current_version: int


# --- User Preferences schemas ---


class UserPreferencesResponse(BaseModel):
    # Bankroll
    initial_bankroll: float
    default_stake: float
    stake_as_percentage: bool
    stake_percentage: float
    daily_stop_loss: float
    stop_loss_unit: str
    low_bankroll_alert: float
    # Notifications in-app
    notif_new_ticket: bool
    notif_stop_loss: bool
    notif_smart_stop: bool
    notif_campaign_ending: bool
    notif_low_bankroll: bool
    # Share
    share_pseudo: str
    share_show_stake: bool
    share_show_gain_euros: bool
    share_show_bookmaker: bool
    share_show_clv: bool
    # Display
    theme: str
    language: str
    currency: str
    odds_format: str
    default_tickets_view: str
    default_campaigns_view: str


# --- PMU Scanner schemas ---


class PMURunnerCard(BaseModel):
    """Un partant dans une course PMU."""
    number: int
    horse_name: str
    jockey: str | None = None
    trainer: str | None = None
    weight: float | None = None
    odds: float | None = None
    odds_morning: float | None = None
    model_prob_win: float | None = None
    model_prob_place: float | None = None
    edge_win: float | None = None
    edge_place: float | None = None
    form: str | None = None
    last_5: list[int] | None = None


class PMURaceCard(BaseModel):
    """Une course PMU avec ses partants."""
    race_id: str
    hippodrome: str
    race_number: int
    race_type: str
    distance: int
    terrain: str | None = None
    post_time: str | None = None
    prize_pool: float | None = None
    num_runners: int
    is_quinteplus: bool = False
    runners: list[PMURunnerCard] = []


class PMUScanResponse(BaseModel):
    """Reponse du scanner PMU (liste de courses avec partants)."""
    races: list[PMURaceCard]
    sport: str = "pmu"
    source: str = "pmu_api"
    cached: bool = False
    cached_at: str | None = None


class UserPreferencesUpdateRequest(BaseModel):
    initial_bankroll: float | None = None
    default_stake: float | None = None
    stake_as_percentage: bool | None = None
    stake_percentage: float | None = None
    daily_stop_loss: float | None = None
    stop_loss_unit: str | None = None
    low_bankroll_alert: float | None = None
    notif_new_ticket: bool | None = None
    notif_stop_loss: bool | None = None
    notif_smart_stop: bool | None = None
    notif_campaign_ending: bool | None = None
    notif_low_bankroll: bool | None = None
    share_pseudo: str | None = None
    share_show_stake: bool | None = None
    share_show_gain_euros: bool | None = None
    share_show_bookmaker: bool | None = None
    share_show_clv: bool | None = None
    theme: str | None = None
    language: str | None = None
    currency: str | None = None
    odds_format: str | None = None
    default_tickets_view: str | None = None
    default_campaigns_view: str | None = None
