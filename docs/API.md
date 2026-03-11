# API Reference BetTracker

Base URL : `/api` (prefixe automatique via reverse proxy Caddy)

## Mecanisme d'authentification

Tous les endpoints proteges attendent le header :
```
Authorization: Bearer <access_token>
```

Sur expiration (401), le client doit appeler `POST /auth/refresh` avec le refresh token, puis reessayer la requete originale.

## Systeme de tiers

| Tier | Description |
|------|-------------|
| `free` | Acces de base (read-only la plupart des endpoints) |
| `pro` | Portfolio, scanner, backtest |
| `premium` | + Campagnes autopilot |

Pendant la periode d'essai (7 jours apres inscription), le tier `free` donne acces aux fonctionnalites `pro`.

## Rate limiting

| Endpoint | Limite |
|----------|--------|
| POST /auth/register | 5/minute |
| POST /auth/login | 10/minute |
| POST /auth/refresh | 20/minute |
| POST /auth/change-password | 5/minute |
| POST /auth/forgot-password | 3/minute |
| POST /auth/reset-password | 5/minute |

---

## Auth

### POST /auth/register
Creer un nouveau compte utilisateur avec 7 jours d'essai gratuit.

**Auth requise** : Non
**Rate limit** : 5/minute

**Body** :
```json
{
  "email": "user@example.com",
  "password": "MotDePasse1",
  "display_name": "Jean Dupont"
}
```

Contraintes password : min 8 chars, max 128, au moins 1 majuscule, 1 minuscule, 1 chiffre.

**Response 201** : `UserResponse`
```json
{
  "id": 1,
  "email": "user@example.com",
  "display_name": "Jean Dupont",
  "tier": "free",
  "is_active": true,
  "trial_ends_at": "2024-03-18T10:00:00",
  "created_at": "2024-03-11T10:00:00",
  "onboarding_completed": false,
  "visited_modules": []
}
```

**Erreurs** :
- `409 Conflict` : Email deja utilise
- `422 Unprocessable Entity` : Donnees invalides (password trop faible, email invalide)

Effet de bord : envoie un email de bienvenue via Resend API (non-bloquant).

---

### POST /auth/login
Authentifier un utilisateur et obtenir des tokens JWT.

**Auth requise** : Non
**Rate limit** : 10/minute

**Body** :
```json
{
  "email": "user@example.com",
  "password": "MotDePasse1"
}
```

**Response 200** : `TokenResponse`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

**Erreurs** :
- `401 Unauthorized` : Email ou mot de passe incorrect

---

### POST /auth/refresh
Echanger un refresh token contre un nouveau pair access + refresh token.

**Auth requise** : Non
**Rate limit** : 20/minute

**Body** :
```json
{
  "refresh_token": "eyJ..."
}
```

**Response 200** : `TokenResponse` (meme schema que login)

**Erreurs** :
- `401 Unauthorized` : Token invalide ou session expiree

Note : chaque changement de mot de passe incremente `token_version`, invalidant tous les refresh tokens existants.

---

### GET /auth/me
Obtenir le profil de l'utilisateur authentifie.

**Auth requise** : Oui

**Response 200** : `UserResponse` (voir schema register)

---

### PATCH /auth/me
Modifier le profil (display_name et/ou email).

**Auth requise** : Oui

**Body** (tous optionnels) :
```json
{
  "display_name": "Nouveau Nom",
  "email": "nouveau@example.com"
}
```

**Response 200** : `UserResponse`

**Erreurs** :
- `409 Conflict` : Nouvel email deja utilise par un autre compte

---

### DELETE /auth/me
Desactiver le compte (soft delete : `is_active = false`).

**Auth requise** : Oui

**Response 200** :
```json
{ "message": "Compte desactive" }
```

---

### POST /auth/change-password
Modifier le mot de passe (necessite l'ancien).

**Auth requise** : Oui
**Rate limit** : 5/minute

**Body** :
```json
{
  "current_password": "AncienMdp1",
  "new_password": "NouveauMdp1"
}
```

**Response 200** : `MessageResponse`

**Erreurs** :
- `400 Bad Request` : Mot de passe actuel incorrect

Effet de bord : incremente `token_version` (invalide toutes les sessions existantes).

---

### POST /auth/forgot-password
Demander un lien de reinitialisation de mot de passe.

**Auth requise** : Non
**Rate limit** : 3/minute

**Body** :
```json
{ "email": "user@example.com" }
```

**Response 200** : `MessageResponse`
Retourne toujours 200 (anti-enumeration). Envoie un email avec un token valable 1 heure si le compte existe.

---

### POST /auth/reset-password
Reinitialiser le mot de passe avec un token valide.

**Auth requise** : Non
**Rate limit** : 5/minute

**Body** :
```json
{
  "token": "abc123...",
  "new_password": "NouveauMdp1"
}
```

**Response 200** : `MessageResponse`

**Erreurs** :
- `400 Bad Request` : Token invalide ou expire

---

### GET /auth/stats
Statistiques de profil de l'utilisateur connecte.

**Auth requise** : Oui

**Response 200** :
```json
{
  "total_bets": 42,
  "roi_pct": 4.5,
  "member_since": "Jan 2024",
  "is_active": true
}
```

---

### POST /auth/logout-all
Invalider toutes les sessions existantes.

**Auth requise** : Oui

**Response 200** : `MessageResponse`

---

### POST /auth/onboarding
Completer l'onboarding en sauvegardant bankroll + mise par defaut.

**Auth requise** : Oui

**Body** :
```json
{
  "bankroll": 1000.0,
  "default_stake_pct": 2.0
}
```

**Response 200** : `UserResponse` (avec `onboarding_completed: true`)

---

### POST /auth/onboarding/skip
Passer l'onboarding sans sauvegarder de preferences.

**Auth requise** : Oui

**Response 200** : `UserResponse` (avec `onboarding_completed: true`)

---

### POST /auth/tour-visited
Marquer un module comme visite (pour ne plus afficher le tour guide).

**Auth requise** : Oui

**Body** :
```json
{ "module": "dashboard" }
```

Modules valides : `dashboard`, `scanner`, `backtest`, `portfolio`, `campaign`

**Response 200** : `MessageResponse`

---

## Portfolio

### GET /portfolio/bets
Lister tous les paris de l'utilisateur.

**Auth requise** : Oui, tier minimum `pro`

**Query params** :
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filtre : `pending`, `won`, `lost`, `void` |
| `campaign_id` | int | Filtre par campagne. `0` = paris manuels uniquement |
| `limit` | int | Max 500, defaut 50 |
| `offset` | int | Pagination, defaut 0 |

**Response 200** : `list[BetResponse]`
```json
[
  {
    "id": 1,
    "sport": "football",
    "home_team": "PSG",
    "away_team": "Marseille",
    "league": "F1",
    "match_date": "2024-03-15T20:00:00",
    "outcome_bet": "H",
    "odds_at_bet": 1.85,
    "odds_at_close": 1.78,
    "stake": 20.0,
    "result": "won",
    "profit_loss": 17.0,
    "clv": -0.037,
    "campaign_id": null,
    "combo_group": null,
    "source": "scanner",
    "bookmaker": "Pinnacle",
    "edge_at_bet": 0.06,
    "note": "Forme excellente a domicile",
    "campaign_version": null,
    "created_at": "2024-03-14T09:00:00"
  }
]
```

---

### POST /portfolio/bets
Enregistrer un nouveau pari.

**Auth requise** : Oui, tier minimum `pro`

**Body** :
```json
{
  "home_team": "PSG",
  "away_team": "Marseille",
  "league": "F1",
  "match_date": "2024-03-15T20:00:00",
  "outcome_bet": "H",
  "odds_at_bet": 1.85,
  "stake": 20.0,
  "is_combo": false,
  "combo_legs": null,
  "campaign_id": null,
  "bookmaker": "Pinnacle",
  "note": "Note personnelle"
}
```

`outcome_bet` : `H` (domicile), `D` (nul), `A` (exterieur)

**Response 201** : `BetResponse`

**Erreurs** :
- `404 Not Found` : `campaign_id` fourni mais campagne introuvable

---

### PATCH /portfolio/bets/{bet_id}
Mettre a jour le resultat d'un pari.

**Auth requise** : Oui, tier minimum `pro`

**Body** :
```json
{ "result": "won" }
```

Valeurs valides : `won`, `lost`, `void`, `pending`

Calcul automatique de `profit_loss` :
- `won` : `stake * (odds_at_bet - 1)`
- `lost` : `-stake`
- `void` : `0`
- `pending` : `null`

**Response 200** : `BetResponse`

Effet de bord : sur settlement (won/lost), verifie les alertes (stop-loss, bankroll basse, smart stop).

---

### PATCH /portfolio/bets/{bet_id}/note
Mettre a jour la note personnelle d'un pari.

**Auth requise** : Oui, tier minimum `pro`

**Body** :
```json
{ "note": "Mon observation" }
```

Max 500 caracteres.

**Response 200** : `BetResponse`

---

### DELETE /portfolio/bets/{bet_id}
Supprimer un pari.

**Auth requise** : Oui, tier minimum `pro`

**Response 204** : No Content

**Erreurs** :
- `404 Not Found` : Pari introuvable

---

### GET /portfolio/stats
Obtenir les statistiques globales du portfolio.

**Auth requise** : Oui, tier minimum `pro`

**Query params** :
| Param | Type | Description |
|-------|------|-------------|
| `from_date` | date (YYYY-MM-DD) | Date de debut (inclusif) |
| `to_date` | date (YYYY-MM-DD) | Date de fin (inclusif) |

**Response 200** : `PortfolioStatsResponse`
```json
{
  "total_bets": 42,
  "pending_bets": 3,
  "won": 24,
  "lost": 15,
  "win_rate": 0.615,
  "total_staked": 840.0,
  "total_pnl": 38.5,
  "roi_pct": 4.58,
  "longest_winning_streak": 6,
  "longest_losing_streak": 3,
  "prev_roi_pct": 2.1,
  "prev_total_staked": 600.0,
  "prev_win_rate": 0.58,
  "prev_total_bets": 30,
  "sport_breakdown": [
    { "sport": "football", "won": 20, "lost": 12, "pnl": 30.0, "staked": 640.0, "roi_pct": 4.69 }
  ]
}
```

Les champs `prev_*` ne sont remplis que si `from_date` et `to_date` sont fournis (comparaison avec la periode precedente de meme duree).

---

### GET /portfolio/history
Historique P&L cumulatif par date.

**Auth requise** : Oui, tier minimum `pro`

**Query params** : `from_date`, `to_date` (optionnels)

**Response 200** : `list[PortfolioHistoryPoint]`
```json
[
  { "date": "2024-01-15", "cumulative_pnl": 15.5, "roi_pct": 2.1 },
  { "date": "2024-01-20", "cumulative_pnl": 28.0, "roi_pct": 3.5 }
]
```

---

## Dashboard

### GET /dashboard/summary
Resume de haut niveau : campagnes actives, paris en attente, resultats recents.

**Auth requise** : Oui, tier minimum `pro`

**Response 200** : `DashboardSummaryResponse`
```json
{
  "active_campaigns": 2,
  "pending_bets": 5,
  "recent_results": { "won": 18, "lost": 12 },
  "campaign_summaries": [
    {
      "id": 1,
      "name": "Strategie Principale",
      "total_bets": 30,
      "won": 18,
      "lost": 10,
      "pending": 2,
      "roi_pct": 5.2
    }
  ]
}
```

---

## Scanner

Tous les endpoints scanner necessitent le tier `pro` minimum.

### GET /scanner/ai-scan
Lire les resultats de scan pre-calcules (le worker calcule en arriere-plan).

**Auth requise** : Oui, tier minimum `pro`

**Query params** :
| Param | Type | Defaut | Description |
|-------|------|--------|-------------|
| `sport` | string | `football` | `football` ou `tennis` |
| `leagues` | string | `""` | Codes de ligues separees par virgule (ex: `E0,F1`) |
| `timeframe` | string | `48h` | `24h`, `48h`, `72h`, `1w` |
| `force` | bool | `false` | Si true et pas de cache, scan inline en fallback |
| `cache_only` | bool | `false` | Ne retourner que le cache |

**Response 200** : `AIScanResponse`
```json
{
  "matches": [
    {
      "home_team": "Arsenal",
      "away_team": "Chelsea",
      "sport": "football",
      "league": "E0",
      "date": "2024-03-16T15:00:00",
      "odds": {
        "1x2": {
          "H": { "pinnacle": 2.10, "bet365": 2.05 },
          "D": { "pinnacle": 3.50 },
          "A": { "pinnacle": 3.20 }
        }
      },
      "model_prob_home": 0.48,
      "model_prob_draw": 0.26,
      "model_prob_away": 0.26,
      "edges": { "H": 0.072, "D": -0.01, "A": -0.03 },
      "data_quality": "green",
      "data_score": 0.87,
      "form_home": "WWDLW",
      "form_away": "LDWWL",
      "h2h_summary": "Arsenal 3W-2D-1L on last 6",
      "home_rest_days": 5,
      "away_rest_days": 3
    }
  ],
  "sport": "football",
  "source": "api_football",
  "cached": true,
  "cached_at": "2024-03-16T08:30:00",
  "research_duration_seconds": 45.2
}
```

Les champs `AIScanMatch` incluent des dizaines de stats contextuelles (possession, tirs, corners, absences, compositions, xG, etc.). Voir le schema complet dans `src/api/schemas.py`.

**Erreurs** :
- `403 Forbidden` : Tier insuffisant

---

### GET /scanner/ai-research
Recherche approfondie sur un match specifique via Claude Code web search.

**Auth requise** : Oui, tier minimum `pro`

**Query params** :
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `sport` | string | Non | `football` (defaut) ou `tennis` |
| `home` | string | Oui | Equipe domicile ou joueur 1 |
| `away` | string | Oui | Equipe exterieure ou joueur 2 |
| `competition` | string | Oui | Nom de la ligue/tournoi |
| `date` | string | Oui | Date du match |
| `force` | bool | Non | Forcer recalcul (ignore cache) |

**Response 200** : `AIResearchResponse`
```json
{
  "sport": "football",
  "match_info": { ... },
  "odds": { ... },
  "home_analysis": { "form": "...", "key_stats": "..." },
  "away_analysis": { ... },
  "injuries": { "home": [...], "away": [...] },
  "lineups": { ... },
  "h2h": { "last_5": [...] },
  "key_players": { ... },
  "tactical_analysis": "Arsenal va utiliser un 4-3-3...",
  "expert_prediction": { "prediction": "H", "confidence": 0.65 },
  "cached": false,
  "cached_at": null,
  "research_duration_seconds": 12.3
}
```

**Erreurs** :
- `502 Bad Gateway` : Service Claude temporairement indisponible

---

### GET /scanner/model-info
Informations sur le modele ML actuel.

**Auth requise** : Non

**Response 200** :
```json
{
  "version": "v6",
  "trained_at": "2024-02-15",
  "features_count": 67,
  "blend": "45% ML + 55% Poisson",
  "models": ["XGBoost", "LightGBM"]
}
```

---

## Backtest

### POST /backtest/run
Lancer un backtest avec des parametres personnalises.

**Auth requise** : Oui, tier minimum `pro`

**Body** (`BacktestRequest`) :
```json
{
  "initial_bankroll": 500.0,
  "staking_strategy": "half_kelly",
  "flat_stake_amount": null,
  "pct_bankroll": 0.02,
  "kelly_fraction": 0.5,
  "max_stake_pct": 0.10,
  "min_edge": 0.05,
  "min_model_prob": 0.55,
  "max_odds": null,
  "min_odds": null,
  "allowed_outcomes": null,
  "excluded_leagues": null,
  "stop_loss_daily_pct": null,
  "stop_loss_total_pct": null,
  "combo_mode": false,
  "combo_max_legs": 4,
  "combo_min_odds": 1.8,
  "combo_max_odds": 3.0,
  "combo_top_n": 3,
  "test_seasons": ["2324", "2425"],
  "sport": "football"
}
```

Strategies de mise (`staking_strategy`) :
- `flat` : Montant fixe en euros (`flat_stake_amount`)
- `half_kelly` : Kelly * `kelly_fraction` (defaut 0.5 = demi-Kelly)
- `pct_bankroll` : Pourcentage fixe de la bankroll (`pct_bankroll`)
- `kelly_dynamic` : Kelly dynamique (fraction ajustee par la confiance)

**Response 200** : `BacktestResponse`
```json
{
  "metrics": {
    "total_bets": 312,
    "wins": 186,
    "losses": 126,
    "win_rate": 0.596,
    "total_staked": 8240.0,
    "total_pnl": 412.5,
    "roi_pct": 5.01,
    "final_bankroll": 912.5,
    "bankroll_growth_pct": 82.5,
    "max_drawdown_pct": 18.3,
    "longest_losing_streak": 8,
    "longest_winning_streak": 12,
    "avg_edge": 0.072,
    "avg_odds": 2.08,
    "avg_clv": 0.021,
    "avg_ev_per_bet": 0.082
  },
  "bets": [
    {
      "date": "2023-08-12",
      "match": "Arsenal vs Nottingham",
      "league": "E0",
      "outcome_bet": "H",
      "model_prob": 0.58,
      "odds": 1.95,
      "stake": 12.5,
      "won": true,
      "pnl": 11.875,
      "bankroll_after": 511.875,
      "edge": 0.084,
      "clv": 0.025,
      "num_legs": null
    }
  ],
  "bankroll_curve": [500.0, 511.875, 498.3, ...],
  "config": { "staking_strategy": "half_kelly", ... }
}
```

**Erreurs** :
- `404 Not Found` : Aucun pari genere avec ces parametres
- `503 Service Unavailable` : Fichier features manquant ou corrompu

---

### POST /backtest/save
Sauvegarder le resultat d'un backtest pour consultation ulterieure.

**Auth requise** : Oui (tout tier)

**Body** :
```json
{
  "name": "Ma strategie optimale",
  "sport": "football",
  "params": { ... },
  "metrics": { ... },
  "bets": [ ... ],
  "bankroll_curve": [ ... ],
  "config": { ... }
}
```

**Response 200** : `SavedBacktestSummary`
```json
{
  "id": 5,
  "name": "Ma strategie optimale",
  "sport": "football",
  "roi_pct": 5.01,
  "total_bets": 312,
  "created_at": "2024-03-16T10:00:00"
}
```

---

### GET /backtest/saved
Lister tous les backtests sauvegardes.

**Auth requise** : Oui (tout tier)

**Response 200** : `list[SavedBacktestSummary]`

---

### GET /backtest/saved/{backtest_id}
Charger un backtest sauvegarde complet.

**Auth requise** : Oui (tout tier)

**Response 200** : `SavedBacktestResponse` (inclut params, metrics, bets, bankroll_curve, config)

**Erreurs** :
- `404 Not Found` : Backtest introuvable
- `500 Internal Server Error` : Donnees corrompues

---

### DELETE /backtest/saved/{backtest_id}
Supprimer un backtest sauvegarde.

**Auth requise** : Oui (tout tier)

**Response 204** : No Content

---

## Campagnes

Tous les endpoints campagnes necessitent le tier `premium`.

### POST /campaigns
Creer une nouvelle campagne.

**Auth requise** : Oui, tier `premium`

**Body** (`CampaignCreateRequest`) :
```json
{
  "name": "Strategie Ligues 1",
  "initial_bankroll": 200.0,
  "flat_stake": 0.05,
  "min_edge": 0.02,
  "min_model_prob": 0.55,
  "min_odds": null,
  "max_odds": null,
  "allowed_outcomes": ["H", "A"],
  "excluded_leagues": ["E2", "F2"],
  "combo_mode": false,
  "combo_max_legs": 4,
  "combo_min_odds": 1.8,
  "combo_max_odds": 3.0,
  "combo_top_n": 3,
  "target_bankroll": 400.0
}
```

`flat_stake` : proportion de la bankroll par pari (ex: 0.05 = 5%)

**Response 200** : `CampaignResponse`

---

### GET /campaigns
Lister toutes les campagnes de l'utilisateur.

**Auth requise** : Oui, tier `premium`

**Response 200** : `list[CampaignResponse]`

---

### GET /campaigns/{campaign_id}
Detail d'une campagne avec statistiques.

**Auth requise** : Oui, tier `premium`

**Response 200** : `CampaignDetailResponse`
```json
{
  "campaign": { ... },
  "stats": {
    "total_bets": 30,
    "pending_bets": 2,
    "won": 18,
    "lost": 10,
    "win_rate": 0.643,
    "total_staked": 600.0,
    "total_pnl": 31.2,
    "roi_pct": 5.2,
    "current_bankroll": 231.2,
    "longest_winning_streak": 5,
    "longest_losing_streak": 3,
    "avg_clv": 0.018,
    "max_drawdown_pct": 12.5,
    "max_drawdown_amount": 29.0,
    "ev_expected": 42.0,
    "algo_stats": { "roi_pct": 5.8, "total_bets": 25, ... },
    "manual_stats": null
  }
}
```

---

### PATCH /campaigns/{campaign_id}
Modifier les parametres d'une campagne.

**Auth requise** : Oui, tier `premium`

**Body** (`CampaignUpdateRequest`) : tous les champs optionnels
- `name`, `status` (`active`/`paused`/`archived`)
- `flat_stake`, `min_edge`, `min_model_prob`
- `min_odds`, `max_odds`
- `allowed_outcomes`, `excluded_leagues`
- `target_bankroll`

**Response 200** : `CampaignResponse`

Effet de bord : si les parametres changent, une nouvelle version est enregistree dans `campaign_versions`.

---

### DELETE /campaigns/{campaign_id}
Supprimer une campagne et tous ses paris et versions associes.

**Auth requise** : Oui, tier `premium`

**Response 204** : No Content

---

### GET /campaigns/{campaign_id}/recommendations
Obtenir les recommandations de paris actuelles pour la campagne.

**Auth requise** : Oui, tier `premium`

Lit le cache scanner et filtre selon les criteres de la campagne (edge, prob, cotes, outcomes, ligues exclues).

**Response 200** : `CampaignRecommendationsResponse`
```json
{
  "campaign_id": 1,
  "current_bankroll": 231.2,
  "recommendations": [
    {
      "home_team": "Arsenal",
      "away_team": "Chelsea",
      "league": "E0",
      "date": "2024-03-16",
      "outcome": "H",
      "model_prob": 0.52,
      "implied_prob": 0.476,
      "edge": 0.093,
      "best_odds": 2.10,
      "bookmaker": "pinnacle",
      "suggested_stake": 11.56
    }
  ],
  "total_scanned": 48
}
```

Trie par edge decroissant. `suggested_stake = current_bankroll * flat_stake`.

---

### POST /campaigns/{campaign_id}/accept
Accepter une recommandation et creer un pari.

**Auth requise** : Oui, tier `premium`

**Body** :
```json
{
  "home_team": "Arsenal",
  "away_team": "Chelsea",
  "league": "E0",
  "match_date": "2024-03-16T15:00:00",
  "outcome": "H",
  "odds": 2.10,
  "stake": 11.56
}
```

**Response 200** : `BetResponse` (source="algo")

**Erreurs** :
- `400 Bad Request` : Campagne inactive

---

### GET /campaigns/{campaign_id}/bets
Lister tous les paris d'une campagne (paris en attente en premier).

**Auth requise** : Oui, tier `premium`

**Response 200** : `list[BetResponse]`

---

### PATCH /campaigns/{campaign_id}/bets/{bet_id}
Mettre a jour le resultat d'un pari de campagne.

**Auth requise** : Oui, tier `premium`

**Body** : `{ "result": "won" }` (won/lost/void/pending)

**Response 200** : `BetResponse`

Effet de bord : sur settlement (won/lost), calcule le CLV en cherchant les cotes de cloture dans `football_matches`, et verifie les alertes smart stop.

---

### DELETE /campaigns/{campaign_id}/bets/{bet_id}
Supprimer un pari d'une campagne.

**Auth requise** : Oui, tier `premium`

**Response 204** : No Content

---

### GET /campaigns/{campaign_id}/history
Courbe de bankroll de la campagne.

**Auth requise** : Oui, tier `premium`

**Response 200** : `list[BankrollPointResponse]`
```json
[
  { "date": "start", "bankroll": 200.0 },
  { "date": "2024-01-15", "bankroll": 212.5 },
  { "date": "2024-01-22", "bankroll": 198.0 }
]
```

---

### GET /campaigns/{campaign_id}/versions
Lister l'historique des versions d'une campagne.

**Auth requise** : Oui, tier `premium`

**Response 200** : `CampaignVersionListResponse`
```json
{
  "versions": [
    {
      "id": 3,
      "campaign_id": 1,
      "version": 2,
      "snapshot": { "name": "...", "flat_stake": 0.05, ... },
      "changed_at": "2024-02-10T14:00:00",
      "change_summary": "flat_stake: 0.03 -> 0.05; min_edge: 0.02 -> 0.04"
    }
  ],
  "current_version": 2
}
```

---

### GET /campaigns/{campaign_id}/versions/{version}
Obtenir un snapshot de version specifique.

**Auth requise** : Oui, tier `premium`

**Response 200** : `CampaignVersionResponse`

---

## Settings

### GET /settings/preferences
Obtenir les preferences utilisateur (cree les defauts si inexistantes).

**Auth requise** : Oui (tout tier)

**Response 200** : `UserPreferencesResponse`
```json
{
  "initial_bankroll": 1000.0,
  "default_stake": 30.0,
  "stake_as_percentage": false,
  "stake_percentage": 2.0,
  "daily_stop_loss": 10.0,
  "stop_loss_unit": "pct",
  "low_bankroll_alert": 200.0,
  "notif_new_ticket": true,
  "notif_stop_loss": true,
  "notif_smart_stop": true,
  "notif_campaign_ending": true,
  "notif_low_bankroll": true,
  "share_pseudo": "",
  "share_show_stake": false,
  "share_show_gain_euros": true,
  "share_show_bookmaker": true,
  "share_show_clv": true,
  "theme": "light",
  "language": "fr",
  "currency": "EUR",
  "odds_format": "decimal",
  "default_tickets_view": "kanban",
  "default_campaigns_view": "grid"
}
```

---

### PATCH /settings/preferences
Modifier partiellement les preferences.

**Auth requise** : Oui (tout tier)

**Body** : `UserPreferencesUpdateRequest` — tous les champs optionnels (meme schema que la response)

**Response 200** : `UserPreferencesResponse`

---

## Notifications

### GET /notifications
Lister les 50 notifications les plus recentes.

**Auth requise** : Oui (tout tier)

**Response 200** : `list[NotificationResponse]`
```json
[
  {
    "id": 12,
    "type": "stop_loss",
    "title": "Stop-loss atteint",
    "message": "Votre perte du jour (45.00€) a atteint votre limite de 40.00€.",
    "is_read": false,
    "metadata": { "daily_loss": 45.0, "threshold": 40.0 },
    "created_at": "2024-03-16T19:00:00"
  }
]
```

Types de notifications : `stop_loss`, `low_bankroll`, `smart_stop`, `campaign_ending`, `new_ticket`

---

### GET /notifications/unread-count
Obtenir le nombre de notifications non lues.

**Auth requise** : Oui (tout tier)

**Response 200** :
```json
{ "count": 3 }
```

---

### PATCH /notifications/{notif_id}/read
Marquer une notification comme lue.

**Auth requise** : Oui (tout tier)

**Response 200** : `NotificationResponse` (avec `is_read: true`)

**Erreurs** :
- `404 Not Found` : Notification introuvable

---

### POST /notifications/read-all
Marquer toutes les notifications comme lues.

**Auth requise** : Oui (tout tier)

**Response 204** : No Content

---

## Health

### GET /health
Health check de base (non authentifie).

**Response 200** :
```json
{
  "status": "ok",
  "service": "bettracker",
  "redis": true
}
```

---

### GET /health/data
Health check detaille : fraicheur des scans, quota API, version du modele.

**Response 200** :
```json
{
  "football_last_scan": "2024-03-16T08:30:00",
  "football_scan_age_minutes": 92.5,
  "tennis_last_scan": "2024-03-16T06:00:00",
  "tennis_scan_age_minutes": 210.0,
  "api_football_quota_remaining": 47,
  "api_football_requests_today": 3,
  "redis_connected": true,
  "model_version": "v6",
  "model_trained_at": "2024-02-15"
}
```
