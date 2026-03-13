export interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface UserStats {
  total_bets: number;
  roi_pct: number;
  member_since: string;
  is_active: boolean;
}

export interface ValueBet {
  home_team: string;
  away_team: string;
  league: string;
  date: string;
  outcome: string;
  model_prob: number;
  implied_prob: number;
  edge: number;
  best_odds: number;
  bookmaker: string;
}

export interface ComboLeg {
  match: string;
  league: string;
  outcome: string;
  odds: number;
  model_prob: number;
}

export interface Combo {
  legs: ComboLeg[];
  num_legs: number;
  combined_odds: number;
  combined_prob: number;
  ev: number;
  potential_gain_per_unit: number;
}

export interface BacktestMetrics {
  total_bets: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_staked: number;
  total_pnl: number;
  roi_pct: number;
  final_bankroll: number;
  bankroll_growth_pct: number;
  max_drawdown_pct: number;
  longest_losing_streak: number;
  longest_winning_streak: number;
  avg_edge: number;
  avg_odds: number;
  avg_clv: number | null;
  avg_ev_per_bet: number;
}

export interface BacktestBet {
  date: string;
  match: string;
  league: string;
  outcome_bet: string;
  model_prob: number;
  odds: number;
  stake: number;
  won: boolean;
  pnl: number;
  bankroll_after: number;
  edge: number;
  clv: number | null;
  num_legs: number | null;
}

export interface BacktestResponse {
  metrics: BacktestMetrics;
  bets: BacktestBet[];
  bankroll_curve: number[];
  config: Record<string, unknown>;
}

export type StakingStrategy = "flat" | "half_kelly" | "pct_bankroll" | "kelly_dynamic";

export interface BacktestParams {
  initial_bankroll: number;
  staking_strategy: StakingStrategy;
  flat_stake_amount: number | null;
  pct_bankroll: number;
  kelly_fraction: number;
  max_stake_pct: number;
  min_edge: number;
  min_model_prob: number | null;
  max_odds: number | null;
  min_odds: number | null;
  stop_loss_daily_pct: number | null;
  stop_loss_total_pct: number | null;
  combo_mode: boolean;
  combo_max_legs: number;
  combo_min_odds: number;
  combo_max_odds: number;
  combo_top_n: number;
  test_seasons: string[];
  sport: string;
  allowed_outcomes: string[] | null;
  excluded_leagues: string[] | null;
}

export interface SavedBacktestSummary {
  id: number;
  name: string;
  sport: string;
  roi_pct: number;
  total_bets: number;
  created_at: string;
}

export interface SavedBacktestFull {
  id: number;
  name: string;
  sport: string;
  params: Record<string, unknown>;
  metrics: BacktestMetrics;
  bets: BacktestBet[];
  bankroll_curve: number[];
  config: Record<string, unknown>;
  created_at: string;
}

export interface SportBreakdown {
  sport: string;
  won: number;
  lost: number;
  pnl: number;
  staked: number;
  roi_pct: number;
}

export interface PortfolioStats {
  total_bets: number;
  pending_bets: number;
  won: number;
  lost: number;
  win_rate: number;
  total_staked: number;
  total_pnl: number;
  roi_pct: number;
  longest_winning_streak: number;
  longest_losing_streak: number;
  prev_roi_pct: number | null;
  prev_total_staked: number | null;
  prev_win_rate: number | null;
  prev_total_bets: number | null;
  sport_breakdown: SportBreakdown[] | null;
  bookmaker_breakdown: { bookmaker: string; total_bets: number; won: number; lost: number; roi_pct: number; total_pnl: number }[];
  league_breakdown: { league: string; total_bets: number; won: number; lost: number; roi_pct: number; total_pnl: number }[];
  market_breakdown: { market: string; total_bets: number; won: number; lost: number; roi_pct: number }[];
}

export interface PortfolioHistoryPoint {
  date: string;
  cumulative_pnl: number;
  roi_pct: number;
}

export interface CampaignSummaryItem {
  id: number;
  name: string;
  total_bets: number;
  won: number;
  lost: number;
  pending: number;
  roi_pct: number;
}

export interface DashboardSummary {
  active_campaigns: number;
  pending_bets: number;
  recent_results: { won: number; lost: number };
  campaign_summaries: CampaignSummaryItem[];
}

export interface Bet {
  id: number;
  sport: string;
  home_team: string;
  away_team: string;
  league: string;
  match_date: string;
  outcome_bet: string;
  odds_at_bet: number;
  odds_at_close: number | null;
  stake: number;
  result: string;
  profit_loss: number | null;
  clv: number | null;
  campaign_id: number | null;
  combo_group: string | null;
  source: "algo" | "manual" | "scanner" | null;
  bookmaker: string | null;
  edge_at_bet: number | null;
  note: string | null;
  campaign_version: number | null;
  created_at: string;
}

export interface BankrollPoint {
  date: string;
  bankroll: number;
}

export interface LeagueInfo {
  name: string;
  country: string;
  flag: string;
  division: number;
}

export const LEAGUE_INFO: Record<string, LeagueInfo> = {
  // --- Ligues ---
  E0:  { name: "Premier League",        country: "Angleterre", flag: "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F", division: 1 },
  F1:  { name: "Ligue 1",               country: "France",     flag: "\uD83C\uDDEB\uD83C\uDDF7", division: 1 },
  I1:  { name: "Serie A",               country: "Italie",     flag: "\uD83C\uDDEE\uD83C\uDDF9", division: 1 },
  D1:  { name: "Bundesliga",            country: "Allemagne",  flag: "\uD83C\uDDE9\uD83C\uDDEA", division: 1 },
  SP1: { name: "La Liga",               country: "Espagne",    flag: "\uD83C\uDDEA\uD83C\uDDF8", division: 1 },
  N1:  { name: "Eredivisie",            country: "Pays-Bas",   flag: "\uD83C\uDDF3\uD83C\uDDF1", division: 1 },
  E1:  { name: "Championship",          country: "Angleterre", flag: "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F", division: 2 },
  D2:  { name: "2. Bundesliga",         country: "Allemagne",  flag: "\uD83C\uDDE9\uD83C\uDDEA", division: 2 },
  I2:  { name: "Serie B",               country: "Italie",     flag: "\uD83C\uDDEE\uD83C\uDDF9", division: 2 },
  SP2: { name: "Segunda División", country: "Espagne",    flag: "\uD83C\uDDEA\uD83C\uDDF8", division: 2 },
  F2:  { name: "Ligue 2",               country: "France",     flag: "\uD83C\uDDEB\uD83C\uDDF7", division: 2 },
  P1:  { name: "Primeira Liga",         country: "Portugal",   flag: "\uD83C\uDDF5\uD83C\uDDF9", division: 1 },
  B1:  { name: "Jupiler Pro League",    country: "Belgique",   flag: "\uD83C\uDDE7\uD83C\uDDEA", division: 1 },
  T1:  { name: "Süper Lig",        country: "Turquie",    flag: "\uD83C\uDDF9\uD83C\uDDF7", division: 1 },
  G1:  { name: "Super League 1",        country: "Grece",      flag: "\uD83C\uDDEC\uD83C\uDDF7", division: 1 },
  SC0: { name: "Premiership",           country: "Ecosse",     flag: "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74\uDB40\uDC7F", division: 1 },
  // --- Coupes domestiques (division 0) ---
  EFA:   { name: "FA Cup",              country: "Angleterre", flag: "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F", division: 0 },
  EFLC:  { name: "EFL Cup",             country: "Angleterre", flag: "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F", division: 0 },
  FCF:   { name: "Coupe de France",     country: "France",     flag: "\uD83C\uDDEB\uD83C\uDDF7", division: 0 },
  DDFB:  { name: "DFB Pokal",           country: "Allemagne",  flag: "\uD83C\uDDE9\uD83C\uDDEA", division: 0 },
  SPDR:  { name: "Copa del Rey",        country: "Espagne",    flag: "\uD83C\uDDEA\uD83C\uDDF8", division: 0 },
  ICI:   { name: "Coppa Italia",        country: "Italie",     flag: "\uD83C\uDDEE\uD83C\uDDF9", division: 0 },
  NKNVB: { name: "KNVB Cup",            country: "Pays-Bas",   flag: "\uD83C\uDDF3\uD83C\uDDF1", division: 0 },
  PTP:   { name: "Taca de Portugal",    country: "Portugal",   flag: "\uD83C\uDDF5\uD83C\uDDF9", division: 0 },
  BCB:   { name: "Belgian Cup",         country: "Belgique",   flag: "\uD83C\uDDE7\uD83C\uDDEA", division: 0 },
  TTC:   { name: "Turkish Cup",         country: "Turquie",    flag: "\uD83C\uDDF9\uD83C\uDDF7", division: 0 },
  GGC:   { name: "Greek Cup",           country: "Grece",      flag: "\uD83C\uDDEC\uD83C\uDDF7", division: 0 },
  SCFA:  { name: "Scottish Cup",        country: "Ecosse",     flag: "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74\uDB40\uDC7F", division: 0 },
  // --- Coupes europeennes (division -1) ---
  UCL:   { name: "UEFA Champions League",          country: "Europe", flag: "\uD83C\uDDEA\uD83C\uDDFA", division: -1 },
  UEL:   { name: "UEFA Europa League",             country: "Europe", flag: "\uD83C\uDDEA\uD83C\uDDFA", division: -1 },
  UECL:  { name: "UEFA Europa Conference League",  country: "Europe", flag: "\uD83C\uDDEA\uD83C\uDDFA", division: -1 },
};

// Backwards-compatible simple map
export const LEAGUES: Record<string, string> = Object.fromEntries(
  Object.entries(LEAGUE_INFO).map(([k, v]) => [k, v.name])
);

// --- Ticket Builder types ---

export interface TicketLeg {
  id: string;
  home_team: string;
  away_team: string;
  league: string;
  date: string;
  outcome: string;
  odds: number;
  model_prob: number;
  bookmaker: string;
  all_odds: Record<string, number>;
  sport?: string;
}

export interface Ticket {
  id: string;
  name: string;
  legs: TicketLeg[];
  stake: number;
  bookmaker: string | null; // null = best odds per leg, string = locked to one bookmaker
}

// --- Campaign types ---

export interface Campaign {
  id: number;
  name: string;
  status: "active" | "paused" | "archived" | "stoploss";
  initial_bankroll: number;
  flat_stake: number;
  min_edge: number;
  min_model_prob: number | null;
  min_odds: number | null;
  max_odds: number | null;
  allowed_outcomes: string[] | null;
  excluded_leagues: string[] | null;
  combo_mode: boolean;
  combo_max_legs: number;
  combo_min_odds: number;
  combo_max_odds: number;
  combo_top_n: number;
  target_bankroll: number | null;
  created_at: string;
}

export interface SourceSubStats {
  roi_pct: number;
  total_bets: number;
  win_rate: number;
  avg_clv: number | null;
  total_staked: number;
  total_pnl: number;
}

export interface CampaignStats {
  total_bets: number;
  pending_bets: number;
  won: number;
  lost: number;
  win_rate: number;
  total_staked: number;
  total_pnl: number;
  roi_pct: number;
  current_bankroll: number;
  longest_winning_streak: number;
  longest_losing_streak: number;
  avg_clv: number | null;
  max_drawdown_pct: number;
  max_drawdown_amount: number;
  ev_expected: number;
  algo_stats: SourceSubStats | null;
  manual_stats: SourceSubStats | null;
}

export interface CampaignVersion {
  id: number;
  campaign_id: number;
  version: number;
  snapshot: Record<string, unknown>;
  changed_at: string;
  change_summary: string;
}

export interface CampaignVersionList {
  versions: CampaignVersion[];
  current_version: number;
}

export interface CampaignDetail {
  campaign: Campaign;
  stats: CampaignStats;
}

export interface CampaignRecommendation {
  home_team: string;
  away_team: string;
  league: string;
  date: string;
  outcome: string;
  model_prob: number;
  implied_prob: number;
  edge: number;
  best_odds: number;
  bookmaker: string;
  suggested_stake: number;
  sport?: string;
}

export interface CampaignRecommendationsResponse {
  campaign_id: number;
  current_bankroll: number;
  recommendations: CampaignRecommendation[];
  total_scanned: number;
}

// --- AI Research types ---

export interface AIScanMatch {
  // Football
  home_team: string | null;
  away_team: string | null;
  // Tennis
  player1: string | null;
  player2: string | null;
  // Common
  sport: string;
  league: string;
  date: string;
  venue: string | null;
  odds: Record<string, unknown>;
  form_home: string | null;
  form_away: string | null;
  form_home_detail: string[];
  form_away_detail: string[];
  form_home_home: string | null;
  form_away_away: string | null;
  position_home: number | null;
  position_away: number | null;
  key_absences_home: string[];
  key_absences_away: string[];
  h2h_summary: string | null;
  h2h_avg_goals: number | null;
  context: string | null;
  motivation: string | null;
  referee: string | null;
  weather: string | null;
  // Football enriched stats
  home_goals_scored: number | null;
  home_goals_conceded: number | null;
  away_goals_scored: number | null;
  away_goals_conceded: number | null;
  home_goals_scored_avg5: number | null;
  home_goals_conceded_avg5: number | null;
  away_goals_scored_avg5: number | null;
  away_goals_conceded_avg5: number | null;
  home_xg_avg: number | null;
  away_xg_avg: number | null;
  home_clean_sheets: number | null;
  away_clean_sheets: number | null;
  home_btts_pct: number | null;
  away_btts_pct: number | null;
  home_over25_pct: number | null;
  away_over25_pct: number | null;
  home_corners_avg: number | null;
  away_corners_avg: number | null;
  home_cards_avg: number | null;
  away_cards_avg: number | null;
  home_red_cards_pg: number | null;
  away_red_cards_pg: number | null;
  home_possession_avg: number | null;
  away_possession_avg: number | null;
  home_shots_pg: number | null;
  away_shots_pg: number | null;
  home_rest_days: number | null;
  away_rest_days: number | null;
  home_current_streak: string | null;
  away_current_streak: string | null;
  home_top_scorer: string | null;
  away_top_scorer: string | null;
  btts_model_prob: number | null;
  over25_model_prob: number | null;
  btts_edge: number | null;
  over25_edge: number | null;
  // Tennis specific
  surface: string | null;
  round: string | null;
  ranking_p1: number | null;
  ranking_p2: number | null;
  p1_age: number | null;
  p2_age: number | null;
  p1_season_record: string | null;
  p2_season_record: string | null;
  p1_surface_record: string | null;
  p2_surface_record: string | null;
  p1_serve_pct: number | null;
  p2_serve_pct: number | null;
  p1_return_pct: number | null;
  p2_return_pct: number | null;
  p1_aces_avg: number | null;
  p2_aces_avg: number | null;
  p1_rest_days: number | null;
  p2_rest_days: number | null;
  // Historical serve stats from Tennis Abstract (rolling avg 5 matches)
  p1_serve_stats: Record<string, number> | null;
  p2_serve_stats: Record<string, number> | null;
  tennis_ml_used: boolean;
  // NBA fields
  nba_ml_used: boolean;
  home_win_rate_10: number | null;
  away_win_rate_10: number | null;
  home_pt_diff_10: number | null;
  away_pt_diff_10: number | null;
  home_pts_avg_10: number | null;
  away_pts_avg_10: number | null;
  home_pts_allowed_10: number | null;
  away_pts_allowed_10: number | null;
  home_b2b: boolean;
  away_b2b: boolean;
  home_streak: number | null;
  away_streak: number | null;
  odds_over: number | null;
  odds_under: number | null;
  total_line: number | null;
  h2h_surface: string | null;
  h2h_last3: string[];
  // NBA advanced stats
  home_fg_pct?: number | null;
  away_fg_pct?: number | null;
  home_three_pct?: number | null;
  away_three_pct?: number | null;
  home_ft_pct?: number | null;
  away_ft_pct?: number | null;
  home_rebounds_avg?: number | null;
  away_rebounds_avg?: number | null;
  home_assists_avg?: number | null;
  away_assists_avg?: number | null;
  home_turnovers_avg?: number | null;
  away_turnovers_avg?: number | null;
  home_steals_avg?: number | null;
  away_steals_avg?: number | null;
  home_blocks_avg?: number | null;
  away_blocks_avg?: number | null;
  home_conference?: string | null;
  away_conference?: string | null;
  home_conference_rank?: number | null;
  away_conference_rank?: number | null;
  home_season_record?: string | null;
  away_season_record?: string | null;
  home_last_5?: string | null;
  away_last_5?: string | null;
  // Rugby fields
  rugby_ml_used: boolean;
  home_tries_avg_10: number | null;
  away_tries_avg_10: number | null;
  home_penalties_avg_10: number | null;
  away_penalties_avg_10: number | null;
  // MLB fields
  mlb_ml_used?: boolean;
  home_runs_avg_10?: number;
  away_runs_avg_10?: number;
  home_runs_allowed_10?: number;
  away_runs_allowed_10?: number;
  starter_home_name?: string;
  starter_away_name?: string;
  // MLB advanced stats
  home_batting_avg?: number | null;
  away_batting_avg?: number | null;
  home_era?: number | null;
  away_era?: number | null;
  home_division?: string | null;
  away_division?: string | null;
  home_division_rank?: number | null;
  away_division_rank?: number | null;
  // Lineup
  fixture_id: number | null;
  lineup_status: "presumed" | "confirmed" | "unavailable";
  lineup_home: { name: string; pos: string; number: number | null; goals?: number; assists?: number; rating?: number; games?: number; is_absent?: boolean }[];
  lineup_away: { name: string; pos: string; number: number | null; goals?: number; assists?: number; rating?: number; games?: number; is_absent?: boolean }[];
  // H2H structured
  h2h_details: { date: string; home_name: string; away_name: string; score_h: number | null; score_a: number | null; winner_id: number | null }[];
  // Key players
  key_players_home: { name: string; goals: number; assists: number; goals_per_match: number; rating: number; is_absent: boolean; position?: string }[];
  key_players_away: { name: string; goals: number; assists: number; goals_per_match: number; rating: number; is_absent: boolean; position?: string }[];
  // Computed by probability_calculator
  model_prob_home: number | null;
  model_prob_draw: number | null;
  model_prob_away: number | null;
  edges: Record<string, number>;
  data_quality: "green" | "yellow" | "red";
  data_score: number;
  lambda_home: number | null;
  lambda_away: number | null;
}

export interface AIScanResponse {
  matches: AIScanMatch[];
  sport: string;
  source: string;
  cached: boolean;
  cached_at: string | null;
  research_duration_seconds: number;
}

// --- User Preferences ---

export interface UserPreferences {
  // Bankroll
  initial_bankroll: number;
  default_stake: number;
  stake_as_percentage: boolean;
  stake_percentage: number;
  daily_stop_loss: number;
  stop_loss_unit: string; // "pct" | "eur"
  low_bankroll_alert: number;
  // Notifications in-app — 5 events
  notif_new_ticket: boolean;
  notif_stop_loss: boolean;
  notif_smart_stop: boolean;
  notif_campaign_ending: boolean;
  notif_low_bankroll: boolean;
  // Share
  share_pseudo: string;
  share_show_stake: boolean;
  share_show_gain_euros: boolean;
  share_show_bookmaker: boolean;
  share_show_clv: boolean;
  // Display
  theme: string;
  language: string;
  currency: string;
  odds_format: string;
  default_tickets_view: string;
  default_campaigns_view: string;
}

export interface AIResearchResponse {
  sport: string;
  match_info: Record<string, unknown>;
  odds: Record<string, unknown>;
  home_analysis: Record<string, unknown>;
  away_analysis: Record<string, unknown>;
  injuries: Record<string, unknown>;
  lineups: Record<string, unknown> | null;
  h2h: Record<string, unknown>;
  key_players: Record<string, unknown> | null;
  tactical_analysis: string;
  expert_prediction: Record<string, unknown>;
  cached: boolean;
  cached_at: string | null;
  research_duration_seconds: number;
}

// --- AI Analyste types ---

export interface AIConversation {
  id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface AIMessageData {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface AIRateLimit {
  used: number;
  limit: number;
  remaining: number;
}

// --- PMU types ---

export interface PMURunnerCard {
  number: number;
  horse_name: string;
  jockey: string | null;
  trainer: string | null;
  weight: number | null;
  odds: number | null;
  odds_morning: number | null;
  model_prob_win: number | null;
  model_prob_place: number | null;
  edge_win: number | null;
  edge_place: number | null;
  form: string | null;
  last_5: number[] | null;
}

export interface PMURaceCard {
  race_id: string;
  hippodrome: string;
  race_number: number;
  race_type: string;
  distance: number;
  terrain: string | null;
  post_time: string | null;
  prize_pool: number | null;
  num_runners: number;
  is_quinteplus: boolean;
  runners: PMURunnerCard[];
}

export interface PMUScanResponse {
  races: PMURaceCard[];
  sport: string;
  source: string;
  cached: boolean;
  cached_at: string | null;
}
