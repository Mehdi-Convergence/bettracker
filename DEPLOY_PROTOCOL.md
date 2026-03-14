# Protocole de Deploy - BetTracker

## Architecture de protection (automatisee)

Le pipeline CI/CD dans `.github/workflows/deploy.yml` protege automatiquement la prod :

### Guards automatiques
1. **CI bloquant** : lint + tests backend + typecheck + tests + build frontend doivent passer AVANT le deploy
2. **Backup DB automatique** : copie de la DB AVANT toute modification (10 backups gardes)
3. **Migrations strictes** : si `alembic upgrade head` echoue, le deploy s'arrete immediatement
4. **Rollback automatique** : si le health check echoue apres restart :
   - Restaure le backup DB
   - Revert le code au commit precedent
   - Redepend les deps + rebuild
   - Restart les services
   - Le job GitHub Actions echoue (notification)
5. **Deep health check** : verifie DB + tables critiques + modeles ML + frontend dist
6. **Smoke tests** : verifie que le frontend est servi, HTTPS accessible
7. **rsync securise** : exclut `.env*`, `data/`, `models/`, `backups/`, `logs/`, `*.db*`

### Protection de branche
- `main` est protegee : require PR + CI pass
- Travailler sur `develop` ou feature branches
- Merger dans `main` uniquement via PR

---

## Checklist manuelle (backup du pipeline)

A suivre si besoin de verifier manuellement avant un merge :

### Avant le merge dans main
- [ ] `uv run ruff check src/` : zero erreurs
- [ ] `uv run pytest tests/ -v` : tous verts
- [ ] `cd frontend && npx tsc --noEmit` : zero erreurs
- [ ] `cd frontend && npm run build` : build reussi
- [ ] Pas de fichiers sensibles dans le diff (`.env`, `.db`, credentials)
- [ ] Si migration : pas de DROP TABLE / DELETE FROM / TRUNCATE

### Apres le merge (automatique mais verifiable)
```bash
# Verifier le deploy GitHub Actions
gh run list --workflow=deploy.yml --limit 1

# Si besoin de verifier manuellement la prod
SSH="ssh -i ~/.ssh/bettracker_vps ubuntu@54.37.231.149"
$SSH "curl -sf http://localhost:8000/health/deep"
$SSH "sudo journalctl -u bettracker-api --since '2 minutes ago' --no-pager | tail -20"
```

---

## Regles d'or

1. **JAMAIS de push direct sur main** : toujours via PR
2. **JAMAIS de `git add -A`** : ajouter fichier par fichier
3. **JAMAIS de migration destructive** sans verification manuelle
4. **JAMAIS de `--no-verify`** ou force push
5. **Le pipeline rollback automatiquement** si la prod ne repond pas
6. **10 backups DB** sont conserves en cas de besoin de restauration manuelle

---

## En cas d'incident post-deploy

### Le rollback automatique a fonctionne
Le deploy.yml a deja restaure la DB et le code. Verifier :
```bash
$SSH "curl -sf http://localhost:8000/health"
$SSH "sudo journalctl -u bettracker-api --since '5 minutes ago' --no-pager | tail -30"
```
Puis investiguer la cause dans les logs du job GitHub Actions.

### Le rollback automatique a echoue
Intervention manuelle :
```bash
# 1. Restaurer le dernier backup DB
$SSH "cp /opt/bettracker/backups/$(ls -t /opt/bettracker/backups/ | head -1) /opt/bettracker/bettracker.db"

# 2. Revert le code
git revert HEAD
git push origin main

# 3. Ou rollback manuel
$SSH "cd /opt/bettracker && git log --oneline -5"
$SSH "cd /opt/bettracker && git checkout <commit_ok> -- ."
$SSH "sudo systemctl restart bettracker-api bettracker-worker"
```
