# Fonctionnalites Frontend — Documentation des Pages

## Navigation globale

Le Layout (`Layout.tsx`) est commun a toutes les pages authentifiees. Il inclut :
- Sidebar gauche avec navigation vers : Dashboard, Scanner, Backtest, Portfolio, Campagnes, AI Analyste
- Header avec breadcrumb, cloche de notifications (`NotificationBell`), et menu profil
- `OnboardingModal` : s'affiche automatiquement au premier acces si `onboarding_completed = false`
- Widget de feedback (bouton flottant)

La cloche de notifications poll `/notifications/unread-count` periodiquement et affiche un badge rouge si count > 0. Au clic, ouvre un dropdown avec les 50 dernieres notifications.

Routing via React Router v6, tous les chemins sont sous `<Layout>` sauf `/login`, `/register`, `/forgot-password`, `/reset-password`.

---

## Dashboard (`/`)

### Description
Page d'accueil principale. Affiche un resume de performance avec KPIs, graphiques de courbe ROI et P&L, repartition par sport, streaks, et les tickets recents.

### Composants visibles

**Header de page**
- Salutation avec prenom de l'utilisateur (`user.display_name.split(" ")[0]`)
- Semaine en cours (`Semaine {N}`)
- Selecteur de periode : 7j, 1 mois, 1 an, Dates (personnalise avec champs date debut/fin)

**Bandeau campagnes** (conditionnel)
- Apparait si des campagnes actives ont des paris
- Affiche pour chaque campagne : nombre de matchs, nom, W-L-En attente
- Bouton "Campagnes →" vers `/campaign`

**4 KPIs** (grille 4 colonnes)
| KPI | Valeur | Delta |
|-----|--------|-------|
| ROI global | `roi_pct%` | vs periode precedente |
| Mise totale | `total_staked€` | delta vs precedent |
| Tickets ce mois | `total_bets` | dont N en attente |
| Taux de reussite | `win_rate%` | vs precedent |

Les deltas ne sont affiches que si `from_date` et `to_date` sont definis.

**Grille principale (2 colonnes)**
- Colonne gauche (2/3 largeur) :
  - ROI Chart (graphique SVG) : courbe ROI avec axe Y en %, 3 labels X, tooltip interactif au hover
  - P&L Cumule : valeur totale + sparkline
  - Performance & Repartition : barres horizontales par sport + donut Won/Lost/Pending
  - Streaks & Records : meilleure serie, pire serie, P&L total, cote moyenne

- Colonne droite (340px) :
  - "Tickets recents" : 5 derniers groupes de paris (simples et combis)
  - Lien "Voir tout" vers `/portfolio`

### Actions et triggers

| Action | Trigger | Appel API |
|--------|---------|-----------|
| Changer la periode | Clic sur bouton 7j/1 mois/1 an | `getPortfolioStats`, `getPortfolioHistory`, `getPortfolioBets`, `getDashboardSummary` |
| Definir dates personnalisees | Modification des inputs date | Meme que ci-dessus |
| Clic "Campagnes →" | Clic bouton | Navigation |
| Clic "Voir tout" | Clic lien | Navigation vers /portfolio |
| Deployer un combi | Clic sur un ticket combi | Expansion locale (pas d'API) |

### Appels API au chargement
```
Promise.all([
  GET /portfolio/stats?from_date=...&to_date=...
  GET /portfolio/history?from_date=...&to_date=...
  GET /portfolio/bets
  GET /dashboard/summary
])
```

### Etats
- `loading` : 4 skeleton cards + zone vide
- `empty` (pas de paris) : KPIs a zero, graphiques vides avec message
- `data` : affichage complet

### Tour guide
Si `"dashboard"` absent de `user.visited_modules`, le `SpotlightTour` se lance automatiquement avec 6 etapes : period-selector, campaign-banner, kpi-roi, roi-chart, pnl-card, recent-bets.

---

## Scanner (`/scanner`)

### Description
Interface principale de detection de value bets. Lit les scans pre-calcules par le worker. Permet de filtrer les matchs, voir les details, et ajouter des paris au ticket builder.

### Composants visibles

**Barre de controle superieure**
- Selecteur de sport : Football | Tennis (ATP)
- Filtres football : ligues (Div 1, Div 2, Coupes, Europe) par pays
- Filtres tennis : circuits (Grand Chelem, ATP, WTA, Challenger, ITF)
- Timeframe : 24h, 48h, 72h, 7 jours
- Tri : Par edge, Par date, Par ligue, Par probabilite
- Filtre texte (recherche equipes)
- Bouton "Rafraichir" (avec indicateur fraicheur du cache)
- Bouton "Filtres avances" (edge min, prob min, cotes min/max)

**Liste de matchs** (panneau gauche)
Chaque carte de match affiche :
- Equipes ou joueurs avec flags
- Ligue et date/heure
- Indicateur de qualite des donnees (vert/jaune/rouge)
- Edge le plus eleve du match (badge colore)
- Probabilites H/D/A du modele
- Meilleure cote disponible par bookmaker
- Forme recente (5 derniers matchs)
- Nombre d'absences cles

**Panneau detail match** (`AIScanMatchDetailPanel`) (panneau droit)
S'ouvre au clic sur un match. Affiche :
- Statistiques detaillees des deux equipes/joueurs
- xG moyen, tirs, corners, possession
- H2H (historique des confrontations)
- Absences confirmees
- Compositions presumes/confirmees
- Cotes par bookmaker et par type (1X2)
- Edges calcules par issue
- Boutons "Ajouter H/D/A au ticket"

**Ticket Builder** (panneau glissant en bas ou a droite)
Construit le ticket de pari en cours. Permet :
- Ajouter plusieurs selections (mode combi)
- Definir la mise
- Calculer les cotes combinees
- Valider et enregistrer via `POST /portfolio/bets`

### Appels API

| Trigger | Appel |
|---------|-------|
| Chargement de la page | `GET /scanner/ai-scan?sport=football&timeframe=48h` |
| Changement de sport | `GET /scanner/ai-scan?sport=tennis` |
| Clic "Rafraichir" | `GET /scanner/ai-scan?force=true` |
| Clic sur un match | `GET /scanner/ai-research?home=...&away=...` (optionnel, si deep research active) |
| Ajouter au ticket et valider | `POST /portfolio/bets` |

### Filtrage
Tout le filtrage est cote client (pas d'appel API supplementaire). Les matchs sont filtres en memoire par :
- Ligue (sous-ensemble de codes)
- Texte libre (equipes)
- Timeframe (date du match)
- Edge minimum
- Probabilite minimum
- Cotes min/max

### Etats
- `loading` : spinner central
- `error` : message d'erreur avec bouton reessayer
- `!hasScanned` : etat initial avec CTA "Lancer le scan"
- `empty` (apres scan) : message aucun match avec les filtres actuels
- `data` : liste des matchs

### Tour guide
Tour en 5 etapes : intro scanner, filtres, carte match, bouton detail, ticket builder.

---

## Backtest (`/backtest`)

### Description
Simulateur de strategies de paris sur donnees historiques. Permet de tester differents parametres et de comparer les resultats avec des backtests sauvegardes.

### Composants visibles

**Selecteur de sport**
Football (saisons 2023/24 + 2024/25 fixes) ou Tennis ATP (2024-2025 fixes). La periode de test n'est pas configurable par l'utilisateur.

**Panneau de parametres** (colonne gauche)
- **Bankroll initiale** : slider + input numerique
- **Edge minimum** : presets 3% (Prudent) / 5% (Equilibre) / 8% (Agressif) + slider
- **Probabilite minimum** : slider (0 a 1)
- **Strategie de mise** : Fixe (€) / 1/2 Kelly (selon edge) / % Bankroll
  - Fixe : champ montant en €
  - Kelly : slider fraction Kelly (0.1 a 1)
  - % BK : slider pourcentage
- **Mise max** : cap en % de la bankroll
- **Stop-loss journalier** : % perte max par jour (optionnel)
- **Stop-loss global** : % perte max total (optionnel)
- **Mode combi** : toggle, puis : max legs (2-6), cotes min/max, top N selections
- **Outcomes autorises** : checkboxes H / D / A
- **Ligues exclues** : input texte

Bouton "Lancer le backtest" (Zap icon)
Bouton "Reset" (RotateCcw)

**Panneau resultats** (colonne droite, apres execution)
- 8 metrics cartes : ROI, P&L, Win rate, Bankroll finale, Total paris, Drawdown max, Avg edge, Avg CLV
- Graphique de courbe de bankroll (Recharts LineChart)
  - Multi-courbes si plusieurs backtests en memoire pour comparaison
- Bouton "Sauvegarder"
- Bouton "Telecharger CSV"
- Zone d'alertes automatiques :
  - Strategie solide (ROI positif + drawdown < 15%)
  - Sur-filtrage (< 5 paris / 30 jours)
  - Sous-filtrage (> 200 paris / 30 jours)
  - ROI excessif (> 20% = possible overfitting)
  - Drawdown eleve (> 40%)

**Backtests sauvegardes** (onglet ou section separee)
Liste des backtests precedemment sauvegardes avec ROI, total bets, date. Clic charge les resultats. Bouton de suppression.

**Tableau des paris** (section depliable)
Tous les paris simules : date, match, outcome, prob modele, cotes, mise, resultat, P&L, bankroll apres.

### Appels API

| Trigger | Appel |
|---------|-------|
| Clic "Lancer le backtest" | `POST /backtest/run` |
| Clic "Sauvegarder" | `POST /backtest/save` |
| Chargement de la page | `GET /backtest/saved` |
| Clic sur un backtest sauvegarde | `GET /backtest/saved/{id}` |
| Clic poubelle | `DELETE /backtest/saved/{id}` |

### Etats
- Initial : formulaire vide, section resultats cachee
- `loading` : bouton desactive, spinner
- `error` : alert rouge avec detail
- `data` : resultats complets + graphique

### Tour guide
Tour en 4 etapes : parametres edge, strategie mise, bouton lancer, zone resultats.

---

## Campaign (`/campaign`)

### Description
Liste de toutes les campagnes autopilot. Permet de creer, consulter et gerer les campagnes.

### Guard d'acces
Necessite tier `premium`. Si tier inferieur : page bloquee avec CTA upgrade.

### Composants visibles
- Bouton "Nouvelle campagne" (ouvre modal)
- Liste / grille de cards de campagnes
  - Nom, statut (badge vert/orange/gris)
  - Bankroll initiale et actuelle
  - ROI, W-L
  - Lien vers detail
- Modal de creation (form) :
  - Nom, bankroll initiale
  - Mise par pari (% bankroll)
  - Edge minimum, probabilite minimum
  - Cotes min/max
  - Outcomes autorises (H/D/A)
  - Ligues exclues
  - Mode combi (toggle + config)
  - Bankroll cible

### Appels API

| Trigger | Appel |
|---------|-------|
| Chargement de la page | `GET /campaigns` |
| Clic "Creer" | `POST /campaigns` |
| Clic sur une campagne | Navigation vers `/campaign/{id}` |

---

## CampaignDetail (`/campaign/{id}`)

### Description
Detail complet d'une campagne : statistiques, recommandations de paris, historique des paris, courbe de bankroll, historique des versions.

### Composants visibles

**Header**
- Nom de la campagne (editable inline)
- Badge statut avec toggle Actif/Pause/Archivee
- KPIs : bankroll actuelle, ROI, W-L-Pending, avg CLV

**Onglet Recommandations**
- Liste des matchs actuels matchant les criteres de la campagne
- Pour chaque reco : match, outcome, edge, cote, bookmaker, mise suggeree
- Bouton "Accepter" → cree un pari (source="algo")
- Nombre total de matchs scannes

**Onglet Paris** (KanbanBoard ou liste)
- Vue kanban : colonnes En attente / Gagne / Perdu
- Chaque carte : match, outcome, cote, mise, P&L, CLV
- Actions : marquer Won/Lost/Void, supprimer
- Tri par date

**Onglet Historique**
- Courbe de bankroll (graphique LineChart)

**Onglet Versions**
- Historique des modifications des parametres
- Pour chaque version : numero, date, resume des changements, snapshot complet

**Panneau parametres** (sidebar ou modal)
- Modifier les criteres de la campagne (PATCH)
- Voir le snapshot de la version courante

### Appels API

| Trigger | Appel |
|---------|-------|
| Chargement | `GET /campaigns/{id}` (detail + stats) |
| Onglet Recommandations | `GET /campaigns/{id}/recommendations` |
| Clic "Accepter" | `POST /campaigns/{id}/accept` |
| Onglet Paris | `GET /campaigns/{id}/bets` |
| Marquer resultat | `PATCH /campaigns/{id}/bets/{bet_id}` |
| Supprimer pari | `DELETE /campaigns/{id}/bets/{bet_id}` |
| Onglet Historique | `GET /campaigns/{id}/history` |
| Onglet Versions | `GET /campaigns/{id}/versions` |
| Clic version | `GET /campaigns/{id}/versions/{v}` |
| Modifier parametres | `PATCH /campaigns/{id}` |

---

## Portfolio (`/portfolio`)

### Description
Gestion complete des paris : creation manuelle, mise a jour des resultats, filtres, statistiques.

### Composants visibles

**Header avec filtres**
- Filtre par statut : Tous / En attente / Gagne / Perdu / Void
- Filtre par campagne (dropdown)
- Filtre par date (from/to)
- Filtre par sport
- Bouton "Ajouter un pari" (ouvre modal)

**Stats en haut de page**
Bande de 4 stats : Total parié, ROI, Taux de reussite, P&L

**Vue des paris**
- Vue liste : tableau classique avec colonnes Match, Outcome, Cote, Mise, Resultat, P&L, CLV
- Vue kanban (`KanbanBoard`) : colonnes En attente / Gagne / Perdu

**TicketDetailDrawer** (panneau lateral)
S'ouvre au clic sur un pari. Affiche :
- Toutes les infos du pari
- CLV et cotes de cloture
- Champ note editable
- Boutons marquer Won/Lost/Void/Pending
- Bouton supprimer

**Modal creation de pari**
- Equipe domicile/exterieure (avec autocomplete)
- Ligue, date, outcome (H/D/A)
- Cote, mise, bookmaker, note
- Campagne associee (optionnel)

### Appels API

| Trigger | Appel |
|---------|-------|
| Chargement | `GET /portfolio/bets`, `GET /portfolio/stats` |
| Changer filtre | `GET /portfolio/bets?status=...` |
| Changer periode stats | `GET /portfolio/stats?from_date=...` |
| Ajouter pari | `POST /portfolio/bets` |
| Marquer resultat | `PATCH /portfolio/bets/{id}` |
| Modifier note | `PATCH /portfolio/bets/{id}/note` |
| Supprimer | `DELETE /portfolio/bets/{id}` |
| Autocomplete equipe | `GET /teams/search?q=...` |

### Etats
- `loading` : skeleton liste
- `empty` : message avec CTA "Ajouter votre premier pari"
- `data` : liste ou kanban

---

## AIAnalyste (`/ai-analyste`)

### Description
Interface de recherche approfondie sur un match specifique via Claude Code web search. Analyse contextuelle avancee : forme, blessures, tactique, prediction d'expert.

### Composants visibles

**Formulaire de recherche**
- Sport (Football / Tennis)
- Equipe domicile / Equipe exterieure (autocomplete)
- Competition / Ligue
- Date du match
- Bouton "Analyser"

**Panneau de resultats** (apres analyse)
- Informations du match
- Cotes du marche
- Analyse equipe domicile (forme, stats cles, style de jeu)
- Analyse equipe exterieure
- Blessures et suspensions
- Compositions presumees
- H2H (5 derniers matchs)
- Joueurs cles
- Analyse tactique (texte long)
- Prediction d'expert avec niveau de confiance

**Indicateur de cache**
- Si resultat vient du cache : "Analyse du {date}" avec bouton "Rafraichir"
- Si calcul en cours : barre de progression, duree estimee

### Appels API

| Trigger | Appel |
|---------|-------|
| Clic "Analyser" | `GET /scanner/ai-research?sport=...&home=...&away=...&competition=...&date=...` |
| Clic "Rafraichir" | Meme + `force=true` |

### Etats
- Initial : formulaire vide
- `loading` : spinner avec message "Analyse en cours..." (peut durer 10-30s)
- `error` : alert "Service temporairement indisponible"
- `data` : rapport complet

---

## Settings (`/settings`)

### Description
Preferences utilisateur : bankroll, stop-loss, notifications, partage, affichage.

### Composants visibles

**Section Bankroll**
- Bankroll initiale globale (input €)
- Mise par defaut (€ fixe ou % de la bankroll, toggle)
- Stop-loss journalier (€ ou %)
- Alerte bankroll basse (seuil €)

**Section Notifications in-app**
Toggles pour 5 evenements :
- Nouveau ticket genere par la campagne
- Stop-loss atteint
- Smart stop (ROI negatif sur les 20 derniers paris)
- Fin de campagne approche
- Bankroll basse

**Section Partage de tickets**
- Pseudo public
- Toggles : afficher la mise / afficher les gains en € / afficher le bookmaker / afficher le CLV

**Section Affichage**
- Theme : Clair / Sombre / Auto
- Langue : FR / EN / ES
- Devise : EUR / GBP / USD / CHF
- Format des cotes : Decimal / Fractionnaire / Americain
- Vue par defaut des tickets : Kanban / Liste / Campagne
- Vue par defaut des campagnes : Grille / Kanban

### Appels API

| Trigger | Appel |
|---------|-------|
| Chargement | `GET /settings/preferences` |
| Modification d'un champ | `PATCH /settings/preferences` (debounce ou on blur) |

---

## Parametres (`/parametres`)

### Description
Parametres du compte personnel : profil, mot de passe, abonnement, suppression du compte.

### Composants visibles

**Section Profil**
- Champ nom d'affichage (editable)
- Champ email (editable)
- Bouton "Sauvegarder"
- Stats : total paris, ROI global, membre depuis

**Section Securite**
- Formulaire changement de mot de passe (ancien + nouveau + confirmation)
- Bouton "Deconnecter toutes les sessions"

**Section Abonnement**
- Tier actuel avec badge (Free / Pro / Premium)
- Date de fin d'essai si applicable
- Bouton "Upgrader" (redirection paiement, non implement dans cette version)

**Section Danger**
- Bouton "Supprimer mon compte" (confirmation modale)

### Appels API

| Trigger | Appel |
|---------|-------|
| Chargement | `GET /auth/me`, `GET /auth/stats` |
| Sauvegarder profil | `PATCH /auth/me` |
| Changer mot de passe | `POST /auth/change-password` |
| Deconnecter partout | `POST /auth/logout-all` |
| Supprimer compte | `DELETE /auth/me` |

---

## Login (`/login`)

### Description
Page de connexion. Accessible sans authentification.

### Composants visibles
- Logo + titre "BetTracker"
- Champ email
- Champ mot de passe (avec toggle afficher/masquer)
- Bouton "Se connecter"
- Lien "Mot de passe oublie ?" → `/forgot-password`
- Lien "Creer un compte" → `/register`
- Message d'erreur si echec

### Appels API

| Trigger | Appel |
|---------|-------|
| Clic "Se connecter" | `POST /auth/login` |

Apres succes : stockage de `access_token` et `refresh_token` dans localStorage, redirection vers `/`.

### Etats
- Initial : formulaire vide
- `loading` : bouton desactive + spinner
- `error` : message rouge sous le formulaire
- Succes : redirection automatique

---

## Register (`/register`)

### Description
Page d'inscription. Accessible sans authentification.

### Composants visibles
- Logo + titre
- Champ nom d'affichage
- Champ email
- Champ mot de passe (avec indicateur de force : majuscule, minuscule, chiffre, 8 chars min)
- Champ confirmation mot de passe
- Bouton "Creer mon compte"
- Lien "Deja un compte ?" → `/login`
- Indicateur d'essai : "7 jours d'essai gratuit inclus"

### Appels API

| Trigger | Appel |
|---------|-------|
| Clic "Creer mon compte" | `POST /auth/register` |

Apres succes : affichage de l'`OnboardingModal` (bankroll + mise par defaut), puis redirection vers `/`.

---

## ForgotPassword (`/forgot-password`)

### Description
Demande de reinitialisation de mot de passe.

### Composants visibles
- Champ email
- Bouton "Envoyer le lien"
- Lien "Retour a la connexion"
- Message de confirmation (meme message qu'email inconnu : anti-enumeration)

### Appels API

| Trigger | Appel |
|---------|-------|
| Clic "Envoyer" | `POST /auth/forgot-password` |

---

## ResetPassword (`/reset-password`)

### Description
Reinitialisation du mot de passe via le token recu par email.

Le token est lu depuis le query param `?token=...` de l'URL.

### Composants visibles
- Champ nouveau mot de passe
- Champ confirmation
- Indicateur de force du mot de passe
- Bouton "Reinitialiser"
- Lien "Se connecter"

### Appels API

| Trigger | Appel |
|---------|-------|
| Clic "Reinitialiser" | `POST /auth/reset-password` avec le token de l'URL |

Apres succes : redirection vers `/login` avec message de confirmation.

### Etats
- Si token absent de l'URL : affichage d'une erreur immediate
- `loading` : bouton desactive
- `error` : "Token invalide ou expire"
- Succes : message + redirection
