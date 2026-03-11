# Guide de Deploiement BetTracker

## Workflow Dev → Prod

```
Developpement local
  |
  | git push origin main
  v
GitHub Actions CI (ci.yml)
  ├── Backend : lint (ruff) + tests (pytest)
  └── Frontend : lint (eslint) + type-check (tsc) + build (vite)
        |
        | (si CI passe)
        v
GitHub Actions Deploy (deploy.yml)
  └── SSH vers VPS OVH
        ├── git pull origin main
        ├── docker compose up -d --build
        ├── alembic upgrade head
        └── docker image prune -f
```

---

## Infrastructure VPS

| Parametre | Valeur |
|-----------|--------|
| Fournisseur | OVH |
| Modele | VPS-1 |
| IP publique | 54.37.231.149 |
| Hostname | vps-aeac00b1.vps.ovh.net |
| Utilisateur | ubuntu |
| OS | Ubuntu 24.04 LTS |
| Localisation | Gravelines, France (GRA) |
| Domaine | betracker.fr |
| Chemin applicatif | /opt/bettracker |
| Cle SSH | ~/.ssh/bettracker_vps |

Connexion SSH :
```bash
ssh -i ~/.ssh/bettracker_vps ubuntu@54.37.231.149
```

---

## Architecture production (Docker Compose)

La production utilise deux fichiers compose en override :
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Services

| Service | Image | Ports internes | Role |
|---------|-------|---------------|------|
| caddy | caddy:2-alpine | 80, 443 (publics) | Reverse proxy + SSL auto |
| frontend | build local | port retire | Nginx sert les fichiers statiques |
| backend | build local | port retire | API FastAPI + worker |
| worker | build local | aucun | Scan periodique background |
| postgres | postgres:16-alpine | port retire | Base de donnees |
| redis | redis:7-alpine | port retire | Cache |

En production, seul Caddy expose des ports publics (80 et 443). Tous les autres services communiquent uniquement via le reseau Docker interne.

### Volumes persistants

| Volume | Monte dans | Contenu |
|--------|-----------|---------|
| `pg-data` | /var/lib/postgresql/data | Donnees PostgreSQL |
| `model-data` | /app/models | Modeles ML serializés |
| `cache-data` | /app/data/cache | Cache scan JSON |
| `caddy-data` | /data | Certificats Let's Encrypt |
| `caddy-config` | /config | Config Caddy |

---

## Caddy + SSL automatique

Le fichier `Caddyfile` a la racine configure le reverse proxy :
```
{$DOMAIN} {
    reverse_proxy /api/* backend:8000
    reverse_proxy /* frontend:80
}
```

Caddy gere automatiquement :
- Obtention des certificats Let's Encrypt (ACME)
- Renouvellement automatique avant expiration
- Redirection HTTP → HTTPS
- HTTP/2 et HTTP/3

Prerequis :
1. Le domaine DNS doit pointer vers l'IP du VPS (A record)
2. La variable `DOMAIN` doit etre definie dans `.env` sur le serveur

---

## CI/CD GitHub Actions

### ci.yml — Pipeline de Continous Integration

Declencheur : push sur `main` ou `develop`, pull requests, appel depuis `deploy.yml`

**Job backend** (ubuntu-latest) :
1. `actions/checkout@v4`
2. `astral-sh/setup-uv@v4` (version latest)
3. `actions/setup-python@v5` (Python 3.12)
4. `uv sync` — installation des dependances
5. `uv run ruff check src/` — linting
6. `uv run pytest tests/ -v` (avec `TESTING=1` pour bypasser la validation JWT)

**Job frontend** (ubuntu-latest, working-directory: frontend) :
1. `actions/checkout@v4`
2. `actions/setup-node@v4` (Node 22, cache npm)
3. `npm ci` — installation exacte depuis package-lock.json
4. `npm run lint` — ESLint
5. `npx tsc --noEmit` — type check TypeScript
6. `npm run test` — tests unitaires
7. `npm run build` — build de production Vite

### deploy.yml — Pipeline de Deploiement

Declencheur : push sur `main` uniquement

**Concurrency** : `group: deploy-production`, `cancel-in-progress: false` (un seul deploy a la fois, le second attend)

**Prerequis** : le job `ci` doit passer.

**Job deploy** (ubuntu-latest, environment: production) :
```bash
# Sur le VPS via SSH (appleboy/ssh-action@v1.0.3)
set -e
cd /app/bettracker
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans
docker compose exec -T backend uv run alembic upgrade head
docker image prune -f
```

### Secrets GitHub necessaires

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | IP du serveur (54.37.231.149) |
| `VPS_USER` | Utilisateur SSH (ubuntu) |
| `VPS_SSH_KEY` | Cle privee SSH (contenu complet) |
| `VPS_PORT` | Port SSH (22 par defaut) |

Ces secrets sont configures dans GitHub → Settings → Secrets and variables → Actions → Secrets.

---

## Variables d'environnement production

Fichier `/opt/bettracker/.env` sur le VPS :

```env
# Obligatoires
JWT_SECRET_KEY=<64 bytes random — generer avec: python -c "import secrets; print(secrets.token_urlsafe(64))">
POSTGRES_PASSWORD=<mot_de_passe_fort>
DOMAIN=betracker.fr

# Base de donnees (auto-configure via Docker Compose)
POSTGRES_USER=bettracker
POSTGRES_DB=bettracker

# API Keys (optionnels, fonctionnalites degradées si absents)
API_FOOTBALL_KEY=<cle_api_football>
ODDS_API_KEY=<cle_odds_api>
OPENWEATHER_API_KEY=<cle_openweather>

# Email (optionnel, emails de bienvenue et reset)
RESEND_API_KEY=<cle_resend>
RESEND_FROM_EMAIL=BetTracker <noreply@betracker.fr>
ADMIN_EMAIL=contact@betracker.fr

# Configuration (derives du DOMAIN automatiquement dans docker-compose.prod.yml)
# FRONTEND_URL et ALLOWED_ORIGINS sont injectes automatiquement
```

Le fichier `.env` doit etre protege :
```bash
chmod 600 /opt/bettracker/.env
```

---

## Commandes de deploiement

### Premier deploiement (setup initial)

```bash
# Sur le VPS
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git

# Clone du repo
cd /opt
sudo git clone https://github.com/<user>/bettracker.git
sudo chown -R ubuntu:ubuntu bettracker
cd bettracker

# Creer le fichier .env
cp .env.example .env
nano .env  # remplir les variables

# Premier lancement
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Verifier les logs
docker compose logs -f backend

# Lancer les migrations
docker compose exec backend uv run alembic upgrade head

# Verifier la sante
curl https://betracker.fr/api/health
```

### Deploiement manuel (sans CI/CD)

```bash
cd /opt/bettracker
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans
docker compose exec -T backend uv run alembic upgrade head
docker image prune -f
```

### Commandes utiles en production

```bash
# Voir les logs en temps reel
docker compose logs -f backend
docker compose logs -f worker
docker compose logs -f caddy

# Restart un service
docker compose restart backend
docker compose restart worker

# Shell dans un container
docker compose exec backend bash
docker compose exec backend uv run python -c "from src.database import SessionLocal; print('OK')"

# Backup base de donnees
docker compose exec postgres pg_dump -U bettracker bettracker > backup_$(date +%Y%m%d).sql

# Lancer les migrations manuellement
docker compose exec backend uv run alembic upgrade head

# Voir les images Docker
docker images

# Voir l'espace disque
docker system df
```

---

## Procedure de rollback

### Rollback automatique (CI/CD)
Si le build CI echoue, le deploy ne se lance pas → le code precedent reste en production.

### Rollback manuel (code)

```bash
# Sur le VPS
cd /opt/bettracker

# Voir les derniers commits
git log --oneline -10

# Revenir a un commit specifique
git checkout <commit-sha>

# Rebuilder
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Si la migration est incompatible, faire un downgrade
docker compose exec backend uv run alembic downgrade -1
```

### Rollback de migration Alembic

```bash
# Voir l'historique des migrations
docker compose exec backend uv run alembic history

# Revenir d'une migration en arriere
docker compose exec backend uv run alembic downgrade -1

# Revenir a une revision specifique
docker compose exec backend uv run alembic downgrade <revision_id>
```

---

## Seed data pour demonstration

Pour initialiser un environnement de demo avec des donnees :

```bash
# 1. Collecter les donnees football (telechargement CSV football-data.co.uk)
docker compose exec backend uv run python -m src.cli.main collect-football

# 2. Collecter les donnees tennis
docker compose exec backend uv run python -m src.cli.main collect-tennis

# 3. Construire les features football
docker compose exec backend uv run python -m src.cli.main build-features

# 4. Entrainer le modele football
docker compose exec backend uv run python -m src.cli.main train-football

# 5. Entrainer le modele tennis
docker compose exec backend uv run python -m src.cli.main train-tennis

# 6. Lancer le premier scan (si API-Football key configuree)
docker compose exec backend uv run python -m src.workers.scan_worker
```

---

## Monitoring et alertes

### Health checks natifs Docker

Les healthchecks sont definis dans `docker-compose.yml` :
- **backend** : `python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"` — interval 10s, timeout 5s, 3 retries
- **postgres** : `pg_isready -U bettracker` — interval 5s
- **redis** : `redis-cli ping` — interval 5s

### Endpoints de monitoring

```bash
# Sante de base
GET https://betracker.fr/api/health

# Sante detaillee (fraicheur scans, quota API, version modele)
GET https://betracker.fr/api/health/data
```

### Verifications manuelles

```bash
# Voir l'etat de tous les services
docker compose ps

# Verifier la connexion PostgreSQL
docker compose exec postgres pg_isready -U bettracker

# Verifier Redis
docker compose exec redis redis-cli ping

# Verifier la fraicheur du scan football
curl https://betracker.fr/api/health/data | jq .football_scan_age_minutes

# Verifier les logs d'erreur
docker compose logs backend --since 1h | grep -i error
docker compose logs worker --since 1h | grep -i error
```

---

## Bugs corriges en production (historique)

Ces bugs ont ete rencontres et corriges lors du premier deploiement sur le VPS OVH :

1. **PERIOD_OPTIONS unused** : variable non utilisee causant un warning ruff
2. **ALLOWED_ORIGINS format** : doit etre une liste JSON, pas une chaine separee par virgules
3. **libgomp1 manquant** : dependance LightGBM absente dans le Dockerfile, ajoute `apt-get install libgomp1`
4. **healthcheck `/api/health` → `/health`** : l'endpoint est monte sans prefixe `/api` dans le container
5. **DOMAIN manquant dans Caddy env** : la variable `DOMAIN` doit etre injectee dans l'environnement du service Caddy

Ces correctifs sont tous deja appliques dans le code courant.
