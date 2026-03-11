# Checklist de mise en production — BetTracker

## 1. Infrastructure serveur

- [ ] Louer un VPS (Hetzner CX22 ~5€/mo, 2 vCPU, 4GB RAM, 40GB SSD)
- [ ] Installer Docker + Docker Compose sur le serveur
- [ ] Acheter un domaine (ex: bettracker.fr, ~10€/an)
- [ ] Configurer le DNS : A record → IP du serveur
- [ ] Ouvrir les ports 80 et 443 dans le firewall
- [ ] Configurer SSH avec clé (désactiver password auth)
- [ ] Installer fail2ban pour protection brute-force SSH

## 2. Déploiement initial

- [ ] Cloner le repo sur le serveur
- [ ] Copier `.env` sur le serveur avec les vraies valeurs :
  ```
  JWT_SECRET_KEY=<générer avec: python -c "import secrets; print(secrets.token_urlsafe(64))">
  POSTGRES_PASSWORD=<mot de passe fort>
  DOMAIN=bettracker.fr
  DATABASE_URL=postgresql://bettracker:<password>@postgres:5432/bettracker
  REDIS_URL=redis://redis:6379/0
  API_FOOTBALL_KEY=<ta clé>
  ODDS_API_KEY=<ta clé>
  OPENWEATHER_API_KEY=<ta clé>
  RESEND_API_KEY=<ta clé si emails activés>
  FRONTEND_URL=https://bettracker.fr
  ALLOWED_ORIGINS=https://bettracker.fr
  ```
- [ ] Mettre `DOMAIN=bettracker.fr` dans `.env` (utilisé par Caddyfile)
- [ ] Lancer : `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
- [ ] Vérifier les 5 services : `docker compose ps` (backend, worker, frontend, postgres, redis, caddy)
- [ ] Vérifier HTTPS : `curl https://bettracker.fr/api/health`
- [ ] Vérifier le scan worker : `docker compose logs worker --tail 20`

## 3. Base de données

- [ ] Vérifier que les migrations passent : `docker compose exec backend alembic upgrade head`
- [ ] Créer le premier compte admin via l'API register
- [ ] (Optionnel) Seeder des données de démo : `docker compose exec backend python scripts/seed_dashboard.py`
- [ ] Configurer les backups PostgreSQL (pg_dump cron quotidien)
  ```bash
  # Exemple crontab sur le serveur
  0 3 * * * docker compose exec -T postgres pg_dump -U bettracker bettracker | gzip > /backups/bettracker_$(date +\%Y\%m\%d).sql.gz
  ```
- [ ] Tester la restauration d'un backup

## 4. Sécurité

- [ ] Vérifier que `.env` n'est PAS dans git (`cat .gitignore | grep .env`)
- [ ] Vérifier que les ports postgres (5432) et redis (6379) ne sont PAS exposés en prod
- [ ] Tester le JWT : token expiré = 401, mauvais token = 401
- [ ] Vérifier les CORS : seul le domaine autorisé peut appeler l'API
- [ ] Vérifier les security headers : `curl -I https://bettracker.fr`
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
  - Strict-Transport-Security: max-age=31536000
- [ ] Vérifier que `/api/health/data` n'expose pas de secrets (seulement quotas et timestamps)
- [ ] Changer le mot de passe postgres par défaut
- [ ] S'assurer que le JWT_SECRET_KEY fait au moins 64 caractères

## 5. Monitoring & Alertes

- [ ] Vérifier `/api/health` → `{"status": "ok", "redis": true}`
- [ ] Vérifier `/api/health/data` → scan age < 120 min
- [ ] (Optionnel) Uptime monitoring externe (UptimeRobot gratuit, Better Stack)
  - Surveiller `https://bettracker.fr/api/health` toutes les 5 min
  - Alerte email/SMS si down
- [ ] Configurer les logs Docker (rotation automatique) :
  ```yaml
  # Ajouter dans docker-compose.prod.yml si pas déjà fait
  logging:
    driver: json-file
    options:
      max-size: "10m"
      max-file: "3"
  ```
- [ ] Vérifier les logs worker : pas d'erreur quota API

## 6. API — Quotas et coûts

### Quotas actuels (pré-prod, plans gratuits/bas) :
| API | Plan | Quota | Intervalle scan | Coût |
|-----|------|-------|----------------|------|
| API-Football | Free/Pro | 100-7500 req/j | 1h | $0-20/mo |
| The Odds API | Free | 500 req/mo | 1h | $0 |
| OpenWeatherMap | Free | 1000 req/j | 3h cache | $0 |

### Passage en prod (quand tu as des users payants) :
- [ ] **Upgrade API-Football** → Pro ($20/mo, 7500 req/j)
- [ ] **Upgrade The Odds API** → Starter ($30/mo, 1500 req/mo)
- [ ] **Réduire les intervalles du worker** dans `src/workers/scan_worker.py` :
  ```python
  FOOTBALL_SCAN_INTERVAL = 15 * 60   # 15 min (Pro+)
  TENNIS_SCAN_INTERVAL = 20 * 60     # 20 min
  SCAN_CACHE_TTL = 1200              # 20 min
  ```
- [ ] Vérifier quota via `/api/health/data` → `api_football_quota_remaining`

### Budget prévisionnel :
| Palier | API-Football | Odds API | VPS | Total |
|--------|-------------|----------|-----|-------|
| 0-50 users | $20/mo | $30/mo | $5/mo | **~$55/mo** |
| 50-200 users | $100/mo | $80/mo | $20/mo | **~$200/mo** |
| 200+ users | $300/mo | $80/mo | $60/mo | **~$440/mo** |

## 7. Frontend

- [x] Vérifier que le build Vite fonctionne : `cd frontend && npm run build` ✅ (0 erreur TS, terser actif)
- [x] Obfuscation Terser activée (drop_console, mangle, no sourcemaps) ✅
- [x] CSP strict dans index.html + nginx.conf ✅
- [x] Nginx bloque .map, .env, package.json, dotfiles ✅
- [x] server_tokens off ✅
- [ ] Tester la navigation SPA (refresh sur /scanner, /dashboard, etc.)
- [ ] Vérifier le responsive (mobile, tablette)
- [ ] Tester le login/register/reset password flow complet
- [ ] Vérifier que les scans s'affichent (le worker doit avoir tourné au moins une fois)

## 8. Emails (optionnel, Phase 2)

- [ ] Créer un compte Resend.com (free tier: 3000 emails/mo)
- [ ] Ajouter un domaine vérifié dans Resend
- [ ] Configurer `RESEND_API_KEY` et `RESEND_FROM_EMAIL` dans `.env`
- [ ] Tester le reset password (envoie un email)

## 9. Paiement Stripe (Phase future)

- [ ] Créer un compte Stripe
- [ ] Configurer les plans (Free, Pro $X/mo, Premium $Y/mo)
- [ ] Implémenter le webhook Stripe (`stripe_customer_id`, `stripe_subscription_id` déjà dans le modèle User)
- [ ] Tester le flow complet : inscription → trial 7j → paiement → accès pro

## Phases du plan — Statut développement

| Phase | Description | Statut |
|-------|-------------|--------|
| 1 | Worker background (football + tennis scans) | ✅ Done |
| 2 | Cache unifié Redis (tous clients + quota partagé) | ✅ Done |
| 3 | APIs configurées (AF + Odds API + OpenWeatherMap) | ✅ Done |
| 4 | Data football enrichi (possession, corners, cards, rest_days, météo) | ✅ Done |
| 5 | Tennis H2H + enrichissement SofaScore | ✅ Done |
| 6 | Health endpoint `/health/data` + `/scanner/model-info` | ✅ Done |
| 7 | ML V7 (CLV supprimé, 70 features, metadata.json) | ✅ Done |
| 8 | SofaScore fallback (try/except best-effort) | ✅ Done |
| — | Frontend : 0 erreur TS, terser, CSP, nginx hardened | ✅ Done |
| — | Docker : 5 services, health checks, volumes | ✅ Done |
| — | Tests : 12 suites, CI-ready | ✅ Done |
| — | Migrations : 16 appliquées | ✅ Done |

## 10. Avant le lancement

- [ ] Faire un test end-to-end complet sur le serveur de prod :
  1. Créer un compte
  2. Lancer un scan football + tennis
  3. Créer une campagne
  4. Vérifier le dashboard avec des vrais paris
  5. Tester le portfolio
  6. Tester le backtest
- [ ] Vérifier les performances : scan < 100ms (cache read), pages < 2s
- [ ] Préparer une landing page / page de pricing
- [ ] Configurer Google Analytics ou Plausible (privacy-first)
- [ ] Préparer les CGU / Mentions légales (obligatoire en France)
- [ ] S'assurer que la mention "paris sportifs" est conforme (pas de conseil financier)

## Commandes utiles en prod

```bash
# Démarrer
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Voir les logs
docker compose logs -f backend
docker compose logs -f worker
docker compose logs caddy --tail 50

# Restart un service
docker compose restart worker

# Mise à jour du code
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Backup DB
docker compose exec -T postgres pg_dump -U bettracker bettracker > backup.sql

# Shell dans le backend
docker compose exec backend bash

# Voir le statut des scans
curl -s https://bettracker.fr/api/health/data | python -m json.tool
```
