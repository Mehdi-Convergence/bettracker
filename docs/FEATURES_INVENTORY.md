# BetTracker — Inventaire exhaustif des fonctionnalités

> Document de référence pour définir les plans Free / Pro / Premium

---

## 1. AUTHENTIFICATION & COMPTE

| Fonctionnalité | Description |
|---|---|
| Inscription | Email + nom + mot de passe |
| Connexion | JWT (access + refresh tokens) |
| Mot de passe oublié | Email de reset avec token |
| Réinitialisation mot de passe | Via lien sécurisé |
| Profil | Modifier nom, email |
| Sécurité | Changer mot de passe (jauge de force), déconnecter toutes les sessions |
| Suppression de compte | Soft-delete avec confirmation |
| Onboarding | Modal initial : bankroll + mise par défaut |
| Trial 7 jours | Accès complet pendant 7 jours après inscription |

---

## 2. DASHBOARD

| Fonctionnalité | Description |
|---|---|
| KPI Cards (4) | ROI global, Total misé, Tickets du mois, Win rate — chacun avec delta mois précédent |
| Sélecteur de période | 7j / 1 mois / 1 an / date personnalisée |
| Courbe ROI | Line chart interactif (gradient 2 couleurs) |
| Sparkline P&L | Cumulatif avec axes |
| Répartition par sport | Barres horizontales ROI% + mini donut (gagné/perdu/en attente) |
| Streaks | Plus longue série gagnante/perdante, P&L total, cote moyenne |
| Derniers paris (5) | Singles + combos, statut, cotes combinées |
| Bandeau campagnes | Résumé campagnes actives (W-L, pending) |
| Tour guidé | 7 étapes interactives |

---

## 3. SCANNER IA

| Fonctionnalité | Description |
|---|---|
| Sélection sport | Football / Tennis |
| Scan IA | Bouton scan (force refresh ou cache) + timestamp + durée |
| Layout 3 panneaux | Liste matchs (gauche), Ticket builder (centre), Détail match (droite) |
| **Filtres avancés** | |
| — Par ligue/tournoi | Football : Div 1/2/Coupes/Europe (40+ ligues). Tennis : GS/ATP/WTA/Challengers (80+ tournois) |
| — Par date/heure | Aujourd'hui / 48h / 72h / Semaine / Mois / dates personnalisées / plage horaire |
| — Par valeur | Edge minimum, cotes min/max, value-only toggle, score data minimum |
| — Par affichage | Masquer matchs déjà dans le ticket, recherche par nom |
| — Tri | Par probabilité modèle / edge / ligue / date |
| Carte match | Icône sport, équipes, ligue, date, 3 outcomes (1X2 ou Winner), cotes multi-bookmakers, edge coloré, score data |
| Ajout rapide au ticket | Bouton par outcome |
| **Ticket Builder** | |
| — Multi-tickets | Onglets Ticket 1, 2, 3… |
| — Legs | Ajouter/supprimer des sélections |
| — Mise | Input montant |
| — Cotes combinées | Calcul automatique |
| — EV | Expected Value affiché |
| — Soumission | Crée un Bet dans le portfolio |
| **Panneau détail match** | |
| — Forme | 5 derniers matchs (VVVVD) |
| — H2H | Historique confrontations directes |
| — Stats équipe | Tirs, possession, corners, cartes |
| — Compo probable | Quand disponible |
| — Joueurs clés | Absents, retours |
| — Cotes bookmakers | Tous les bookmakers disponibles |
| Tour guidé | Étapes interactives |

### Couverture sportive

| Sport | Compétitions |
|---|---|
| Football — Div 1 | Premier League, Ligue 1, Serie A, Bundesliga, La Liga, Eredivisie… (20 ligues) |
| Football — Div 2 | Championship, Ligue 2, Serie B, 2. Bundesliga, Segunda… (10 ligues) |
| Football — Coupes | FA Cup, EFL Cup, Coupe de France, DFB Pokal, Copa del Rey… (10 coupes) |
| Football — Europe | Champions League, Europa League, Conference League |
| Tennis — Grand Slam | Australian Open, Roland Garros, Wimbledon, US Open |
| Tennis — ATP | Masters 1000, ATP 500, ATP 250 (50+ tournois) |
| Tennis — WTA | WTA 1000, WTA 500, WTA 250 (50+ tournois) |
| Tennis — Autres | Challengers, ITF (découverte dynamique) |

---

## 4. PORTFOLIO

| Fonctionnalité | Description |
|---|---|
| 3 vues | Kanban (drag-drop) / Liste (tableau trié) / Par campagne |
| KPI strip | Total paris, En attente, Win rate, ROI, Total misé, P&L |
| **Ajout de ticket** | |
| — Saisie manuelle | Équipes (autocomplete), ligue, date, outcome, cote, mise, bookmaker, note |
| — Recherche scanner | Chercher dans le cache IA, clic pour remplir |
| — Mode combo | Multi-legs, cotes combinées auto |
| — Association campagne | Lier un pari à une campagne |
| **Filtres** | Statut (All/Pending/Won/Lost/Void/Ignored/Expired), Sport, Bankroll, Période, Résultat, Tag (ALGO/MANUEL/SCANNER/COMBI), CLV, Bookmaker |
| **Tri** | Date, cotes, mise, P&L, edge, CLV (asc/desc) |
| Drawer détail ticket | Détails complets, modifier résultat, ajouter note, navigation prev/next |
| Export CSV | Télécharger les paris filtrés |
| Tour guidé | Étapes interactives |

---

## 5. CAMPAGNES

| Fonctionnalité | Description |
|---|---|
| Vue grille + Kanban | Toggle entre les 2 vues |
| **Création (4 étapes)** | |
| — Étape 1 : Basique | Nom, bankroll initiale, mise %, edge min, confiance min, plage de cotes |
| — Étape 2 : Combos | Toggle combo, max legs, plage cotes combinées, top N |
| — Étape 3 : Avancé | Stratégie de mise (Flat/Kelly/% Bankroll), fraction Kelly, mise max, stop-loss jour/total, qualité data min |
| — Étape 4 : Planning | Date début, durée, fréquence, alertes |
| Carte campagne | Statut (Active/Paused/Archived), sport, tags config, KPIs (ROI, #bets, P&L) |
| Actions | Dupliquer, Pause/Reprendre, Archiver, Supprimer |
| Recherche & filtre | Par nom, par statut |
| Barre de quota | X/5 campagnes actives |
| **Détail campagne** | |
| — Édition paramètres | Modifier la config (crée une version) |
| — Recommandations IA | Matchs filtrés par paramètres de la campagne |
| — Accepter recommandation | Crée un Bet lié à la campagne |
| — Courbe bankroll | Historique de la bankroll |
| — Table des paris | Liste + filtres |
| — Historique versions | Log de chaque changement de config |
| Tour guidé | Étapes interactives |

---

## 6. BACKTEST

| Fonctionnalité | Description |
|---|---|
| **Mode rapide** | Sport, période (1-3 saisons), bankroll, edge preset (3/5/8%), stratégie de mise, toggle combo |
| **Mode avancé** | |
| — Filtres | Confiance min (40-90%), edge (1-20%), plage cotes, ligues exclues |
| — Bankroll & mise | Bankroll initiale, stratégie, montants, fraction Kelly, mise max |
| — Gestion risque | Stop-loss jour %, stop-loss total % |
| — Combos | Max legs, plage cotes, top N |
| — Saisons | 1 à 3 saisons historiques |
| **Résultats** | Jusqu'à 3 stratégies simultanées (tabs colorés) |
| Métriques | Total bets, W/L, win rate, misé, P&L, ROI, bankroll finale, croissance %, max drawdown, streaks, avg edge/cotes/CLV |
| Courbe bankroll | 1-3 lignes, points peak + drawdown |
| Alertes | Vert (solide), Orange (warning), Rouge (non-profitable) |
| Table des paris | Filtre All/Won/Lost, pagination (20/page), colonnes complètes |
| Sauvegardes | Charger/sauver/supprimer des runs, lister avec ROI + date |
| Export CSV | Télécharger les paris du backtest |
| Créer campagne | Bouton pour pré-remplir une campagne avec les params du backtest |
| Tour guidé | Étapes interactives |

---

## 7. PARAMÈTRES UTILISATEUR

| Fonctionnalité | Description |
|---|---|
| **Bankroll globale** | |
| — Carte résumé | Solde disponible, en jeu, % utilisé (barre de progression) |
| — Bankroll initiale | Input € |
| — Mise par défaut | Input € |
| — Mise en % toggle | Basculer entre montant fixe et % de bankroll |
| — Stop-loss journalier | Input € |
| — Alerte bankroll basse | Input € seuil |
| **Notifications** | |
| — Nouveau ticket proposé | Toggle on/off |
| — Stop-loss déclenché | Toggle on/off |
| — Smart Stop (pause recommandée) | Toggle on/off |
| — Campagne qui se termine | Toggle on/off |
| — Bankroll basse | Toggle on/off |
| — Email | Toggle global |
| — Push | Toggle global |
| **Partage** | |
| — Profil public | Toggle |
| — Pseudo de partage | Input texte |
| — Aperçu lien | Preview URL |
| **Affichage & Langue** | |
| — Thème | Light / Dark / Auto |
| — Langue | FR / EN / DE / IT / ES |
| — Devise | EUR / USD / GBP / CHF |
| — Format date | Configurable |
| — Format heure | 12h / 24h |

---

## 8. SETTINGS (COMPTE)

| Fonctionnalité | Description |
|---|---|
| Avatar | Gradient + initiales |
| Infos profil | Nom, tier, stats (membre depuis, tickets validés, ROI, statut) |
| Tab Compte | Modifier nom, email |
| Tab Sécurité | Changer mot de passe (jauge force), déco toutes sessions |
| Tab Plan & Facturation | 3 cartes plan (Free/Pro/Elite) avec features et prix |
| Tab Confidentialité | Supprimer le compte (confirmation) |

---

## 9. AI ANALYSTE (chat IA)

| Fonctionnalité | Description |
|---|---|
| Interface chat | Historique conversationnel, avatars, styles user/assistant |
| Analyse ticket | EV, confiance, suggestions combis |
| Analyse performance | ROI par sport, points faibles |
| Suggestions amélioration | Recommandations personnalisées |
| Simulation bankroll | Projections |
| Smart Stop | Recommandation de pause |
| Carte match intégrée | Cotes, edge, score data, bouton "Ajouter au ticket" |
| Carte ticket | Legs, cotes combinées, gain potentiel |
| Chart intégré | ROI par sport (barres) |
| Boutons rapides | "Analyser mon ticket", "Value bets ce soir", "Ticket auto", "Revoir stratégie", "Simulation bankroll" |
| **Statut** | UI construite, backend IA non connecté (mock/phase future) |

---

## 10. NOTIFICATIONS

| Fonctionnalité | Description |
|---|---|
| Cloche (header) | Badge nombre non-lues |
| Dropdown | Liste notifications récentes |
| Marquer comme lu | Individuel ou tout d'un coup |
| Types | Stop-loss déclenché, Smart Stop, Bankroll basse, Campagne fin imminente, Nouveau ticket proposé |

---

## 11. ONBOARDING & TOURS

| Fonctionnalité | Description |
|---|---|
| Modal onboarding | Bankroll initiale + mise par défaut (après inscription) |
| Skip | Option de passer |
| Tours guidés | Spotlight sur chaque page (Dashboard, Scanner, Portfolio, Backtest, Campaigns, Settings) |
| Progression | Mémorise les tours déjà vus par module |

---

## 12. INFRASTRUCTURE TECHNIQUE (invisible user)

| Fonctionnalité | Description |
|---|---|
| Worker background | Scans automatiques football (1h) + tennis (1h) |
| Cache Redis unifié | Tous clients API via cache centralisé |
| Quota API partagé | Tracking Redis, pas de dépassement |
| ML V7 | XGBoost + LightGBM, 70 features, blend 45/55 avec Poisson |
| Météo | OpenWeatherMap intégré au scan (pluie, vent, température) |
| Health monitoring | `/health` + `/health/data` (freshness scans, quotas, modèle) |
| Rate limiting | Register 5/min, Login 10/min, etc. |
| Sécurité frontend | Terser, no sourcemaps, CSP strict, nginx hardened |

---

## 13. RESTRICTIONS PAR TIER (état actuel du code)

| Endpoint / Feature | Restriction backend |
|---|---|
| Auth (register, login, reset, profil) | Aucune — accessible à tous |
| Settings / Préférences | Aucune — accessible à tous |
| Notifications | Aucune — accessible à tous |
| Scanner (`/scanner/ai-scan`) | `require_tier("pro")` |
| Portfolio (`/portfolio/*`) | `require_tier("pro")` |
| Dashboard (`/dashboard/summary`) | `require_tier("pro")` |
| Backtest (`/backtest/*`) | `require_tier("pro")` |
| Campagnes (`/campaigns/*`) | `require_tier("premium")` |
| AI Research (`/scanner/ai-research`) | `require_tier("premium")` |

> **Note** : Les utilisateurs en période de trial (7 jours) ont accès à tout.

---

## 14. FONCTIONNALITÉS FUTURES (mentionnées mais non implémentées)

| Feature | Statut |
|---|---|
| Stripe (paiement) | Champs DB prêts (`stripe_customer_id`, `stripe_subscription_id`), pas d'intégration |
| Alertes Telegram | Mentionné dans le plan Elite, pas implémenté |
| Accès API externe | Mentionné dans le plan Elite, pas implémenté |
| AI Analyste backend | UI prête, backend mock |
| Profil public / partage | UI prête, page publique non créée |
| Multi-bookmakers avancé | Scanner montre plusieurs bookmakers, mais pas d'agrégation poussée |
| Basketball / MMA / Hockey | P2, pas prioritaire |
