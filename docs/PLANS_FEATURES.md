# BetTracker - Fonctionnalites par plan

## Plans disponibles

| | Free | Pro | Elite |
|---|---|---|---|
| **Prix mensuel** | 0 (7 jours) | 29/mois | 69/mois |
| **Prix annuel** | - | 23/mois (276/an) | 55/mois (660/an) |
| **Essai** | 7 jours complets | - | - |

## Acces aux modules

| Module | Free | Pro | Elite | Notes |
|--------|------|-----|-------|-------|
| Scanner IA | Pendant trial | Illimite | Illimite | require_tier("pro") |
| Dashboard | Pendant trial | Oui | Oui | require_tier("pro") |
| Portfolio | Pendant trial | Oui | Oui | require_tier("pro") |
| Backtest | Pendant trial | Oui | Oui | require_tier("pro") |
| Partage de tickets | Pendant trial | Oui | Oui | |
| Campagnes | Pendant trial (1) | Non | Illimitees | require_tier("premium") |
| Combos (generateur) | Non | Non | Oui | require_tier("premium") |
| IA Analyste | Oui (10 msg/j) | Oui (50 msg/j) | Oui (200 msg/j) | Rate limit par tier |
| Export CSV | Pendant trial | Non | Oui | |
| Support prioritaire | Non | Non | Oui | |
| Acces nouvelles features | Non | Non | Oui | |
| Admin dashboard | Non | Non | Non | is_admin uniquement |

## Volumetrie et limites

### IA Analyste (Groq API)
| Tier | Messages/jour | Modele | Cout |
|------|--------------|--------|------|
| Free | 10 | llama-3.3-70b-versatile | Gratuit (Groq free) |
| Pro | 50 | llama-3.3-70b-versatile | Gratuit (Groq free) |
| Premium | 200 | llama-3.3-70b-versatile | Gratuit (Groq free) |

- Compteur Redis avec TTL 24h
- Rate limit API : 20 req/minute
- Max 3 rounds d'outils par message
- Historique : 20 derniers messages par conversation

### Scanner
| Parametre | Valeur | Configurable par plan ? |
|-----------|--------|------------------------|
| Sports disponibles | Football, Tennis, NBA, MLB, Rugby, PMU | Non (tous les sports pour tous) |
| Frequence scan football | 1h | Non |
| Frequence scan tennis/nba/mlb/rugby | 2h30 | Non |
| Frequence scan PMU | 30min | Non |
| Rate limit API scanner | 30 req/min | Non |
| Timeframes disponibles | 24h, 48h, 72h, 1w | Non |

### Backtest
| Parametre | Valeur | Configurable par plan ? |
|-----------|--------|------------------------|
| Rate limit | 10 req/min | Non |
| Sports disponibles | Football, Tennis, NBA, MLB, Rugby, PMU | Non |
| Strategies staking | flat, kelly, pct_bankroll | Non |
| Sauvegardes | Illimitees | Non |

### Campagnes
| Parametre | Free (trial) | Pro | Elite |
|-----------|-------------|-----|-------|
| Campagnes actives | 1 | 0 | Illimitees |
| Paris par campagne | Illimites | - | Illimites |
| Versions (historique) | Oui | - | Oui |
| Recommandations auto | Oui | - | Oui |

### API externes — quotas et couts

| API | Quota | Cout | Partage |
|-----|-------|------|---------|
| API-Football | 7500 req/jour (Pro) | ~20$/mois | Tous les users |
| Odds API | 20K credits/jour (budget interne: 650/jour) | ~30$/mois | Tous les users |
| Groq | Rate limit free tier | Gratuit | Per-user (rate limit) |
| ESPN | Illimite (free, no auth) | Gratuit | Tous les users |
| statsapi (MLB) | Illimite (free, no auth) | Gratuit | Tous les users |
| Resend (email) | 100 emails/jour (free) | Gratuit | Tous les users |
| Stripe | Per transaction | ~2.9% + 0.30$ | Per-user |

## Elements configurables pour la monetisation

### Actuellement configurable (config.py)
```
AI_FREE_DAILY_LIMIT = 10
AI_PRO_DAILY_LIMIT = 50
AI_PREMIUM_DAILY_LIMIT = 200
TRIAL_DAYS = 7
ODDS_API_DAILY_BUDGET = 650
```

### Pourrait etre ajoute
- Nombre max de paris en portfolio par plan
- Nombre max de backtests sauvegardes par plan
- Nombre de sports accessibles par plan (ex: free = football only)
- Frequence de scan differenciee par plan
- Deep research (Claude) limite par plan
- Nombre de notifications actives par plan
- Historique de donnees accessible (ex: free = 30j, pro = 1an, elite = tout)

## Implementation technique

### Backend
- `src/api/deps.py` : `require_tier(min_tier)` — compare `TIER_LEVELS = {"free": 0, "pro": 1, "premium": 2}`
- Trial active = acces complet (bypass tier check)
- Rate limits AI : Redis key `ai:daily:{user_id}` avec TTL 24h

### Frontend
- Sidebar : liens visibles selon `user.tier` et `user.is_admin`
- Pages : redirect vers `/dashboard` si tier insuffisant
- Settings : affichage des 3 plans avec bouton upgrade (Stripe checkout)

### Stripe
- `STRIPE_PRO_PRICE_ID` et `STRIPE_PREMIUM_PRICE_ID` dans .env
- Webhook ecoute `customer.subscription.updated` pour mettre a jour le tier
- Portal billing pour gestion autonome par l'utilisateur
