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
  num_legs: number | null;
}

export interface BacktestResponse {
  metrics: BacktestMetrics;
  bets: BacktestBet[];
  bankroll_curve: number[];
  config: Record<string, unknown>;
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
}

export interface Bet {
  id: number;
  home_team: string;
  away_team: string;
  league: string;
  match_date: string;
  outcome_bet: string;
  odds_at_bet: number;
  stake: number;
  result: string;
  profit_loss: number | null;
  campaign_id: number | null;
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
  SP2: { name: "Segunda Divisi\u00f3n", country: "Espagne",    flag: "\uD83C\uDDEA\uD83C\uDDF8", division: 2 },
  F2:  { name: "Ligue 2",               country: "France",     flag: "\uD83C\uDDEB\uD83C\uDDF7", division: 2 },
  P1:  { name: "Primeira Liga",         country: "Portugal",   flag: "\uD83C\uDDF5\uD83C\uDDF9", division: 1 },
  B1:  { name: "Jupiler Pro League",    country: "Belgique",   flag: "\uD83C\uDDE7\uD83C\uDDEA", division: 1 },
  T1:  { name: "S\u00fcper Lig",        country: "Turquie",    flag: "\uD83C\uDDF9\uD83C\uDDF7", division: 1 },
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
  status: "active" | "paused" | "archived";
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
}

export interface CampaignRecommendationsResponse {
  campaign_id: number;
  current_bankroll: number;
  recommendations: CampaignRecommendation[];
  total_scanned: number;
}

// --- AI Research types (Claude Code powered) ---

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
  h2h_surface: string | null;
  h2h_last3: string[];
  // Lineup
  fixture_id: number | null;
  lineup_status: "presumed" | "confirmed" | "unavailable";
  lineup_home: { name: string; pos: string; number: number | null }[];
  lineup_away: { name: string; pos: string; number: number | null }[];
  // H2H structured
  h2h_details: { date: string; home_name: string; away_name: string; score_h: number | null; score_a: number | null; winner_id: number | null }[];
  // Key players
  key_players_home: { name: string; goals: number; assists: number; goals_per_match: number; rating: number; is_absent: boolean }[];
  key_players_away: { name: string; goals: number; assists: number; goals_per_match: number; rating: number; is_absent: boolean }[];
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
