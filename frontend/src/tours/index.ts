import type { TourStep } from "@/components/SpotlightTour";

export const dashboardTour: TourStep[] = [
  {
    target: '[data-tour="preset-selector"]',
    title: "Vos dashboards",
    content: "Gerez plusieurs dashboards personnalises. Cliquez pour basculer entre vos configurations, en creer de nouvelles, les dupliquer ou les supprimer.",
    placement: "bottom",
  },
  {
    target: '[data-tour="edit-mode-btn"]',
    title: "Mode personnalisation",
    content: "Activez le mode edition pour modifier votre dashboard : deplacer, redimensionner, ajouter ou supprimer des widgets.",
    placement: "bottom",
  },
  {
    target: '[data-tour="widget-grid"]',
    title: "Grille de widgets",
    content: "En mode edition, glissez-deposez les widgets pour les reorganiser. Tirez les coins pour les redimensionner a votre guise.",
    placement: "top",
  },
  {
    target: '[data-tour="period-selector"]',
    title: "Filtre de periode",
    content: "Changez la periode d'affichage des statistiques : 7 jours, 1 mois, 3 mois, 1 an ou personnalise.",
    placement: "bottom",
  },
];

export const scannerTour: TourStep[] = [
  {
    target: '[data-tour="sport-toggle"]',
    title: "Toggle Football / Tennis",
    content: "Basculez entre les matchs de football et de tennis. L'application analyse les deux sports.",
    placement: "bottom",
  },
  {
    target: '[data-tour="refresh-btn"]',
    title: "Bouton Refresh",
    content: "Relancez l'analyse IA pour obtenir les dernières prédictions actualisées.",
    placement: "bottom",
  },
  {
    target: '[data-tour="date-presets"]',
    title: "Filtres de date",
    content: "Filtrez par période : Aujourd'hui, 48h, 72h, Semaine ou Mois. Affiche les matchs dans cette fenêtre.",
    placement: "bottom",
  },
  {
    target: '[data-tour="filters"]',
    title: "Filtres avancés",
    content: "Affinez votre recherche : ligue/circuit, équipe, edge minimum, cotes min/max, score de données, et plus.",
    placement: "right",
  },
  {
    target: '[data-tour="value-toggle"]',
    title: "Value Bets uniquement",
    content: "Activez pour ne voir que les paris avec un edge positif : la valeur détectée par le modèle par rapport aux cotes du marché.",
    placement: "bottom",
  },
  {
    target: '[data-tour="match-card"]',
    title: "Carte match",
    content: "Chaque match affiche : équipes/joueurs, ligue, heure, probabilités du modèle et cotes disponibles chez les bookmakers.",
    placement: "right",
  },
  {
    target: '[data-tour="outcome-buttons"]',
    title: "Boutons de résultat",
    content: "Sélectionnez le résultat sur lequel parier. Football : Domicile (1) / Nul (X) / Extérieur (2). Tennis : Joueur 1 / Joueur 2.",
    placement: "bottom",
  },
  {
    target: '[data-tour="edge-display"]',
    title: "Edge (%)",
    content: "La différence entre la probabilité du modèle et celle implicite des cotes. Plus l'edge est élevé, plus le pari a de valeur théorique.",
    placement: "left",
  },
  {
    target: '[data-tour="confidence-stars"]',
    title: "Étoiles de confiance",
    content: "Niveau de confiance du modèle, basé sur la quantité et qualité des données disponibles pour ce match.",
    placement: "left",
  },
  {
    target: '[data-tour="ticket-tab"]',
    title: "Ticket Builder",
    content: "Construisez vos tickets ici : ajoutez des matchs, choisissez simple ou combiné, définissez votre mise et bookmaker.",
    placement: "bottom",
  },
  {
    target: '[data-tour="bookmaker-select"]',
    title: "Sélecteur de bookmaker",
    content: "Comparez les cotes entre bookmakers pour chaque résultat. Choisissez le meilleur prix disponible.",
    placement: "bottom",
  },
  {
    target: '[data-tour="detail-panel"]',
    title: "Panneau de détail",
    content: "Cliquez sur un match pour voir l'analyse complète : statistiques détaillées, historique des confrontations, head-to-head.",
    placement: "left",
  },
];

export const campaignsTour: TourStep[] = [
  {
    target: '[data-tour="create-btn"]',
    title: "Créer une campagne",
    content: "Créez une nouvelle campagne de paris avec vos propres paramètres de staking, filtres et critères de sélection.",
    placement: "bottom",
  },
  {
    target: '[data-tour="quota-bar"]',
    title: "Jauge de quota",
    content: "Nombre de campagnes actives sur votre quota maximum selon votre plan (Free, Pro ou Elite).",
    placement: "bottom",
  },
  {
    target: '[data-tour="search-bar"]',
    title: "Barre de recherche",
    content: "Recherchez une campagne par nom pour la retrouver rapidement.",
    placement: "bottom",
  },
  {
    target: '[data-tour="status-filters"]',
    title: "Filtres de statut",
    content: "Filtrez vos campagnes par statut : Toutes, Actives, En pause ou Archivées.",
    placement: "bottom",
  },
  {
    target: '[data-tour="view-toggle"]',
    title: "Toggle vue",
    content: "Basculez entre la vue grille (cartes) et la vue kanban (colonnes par statut) selon votre préférence.",
    placement: "bottom",
  },
  {
    target: '[data-tour="campaign-card"]',
    title: "Carte campagne",
    content: "Chaque campagne affiche : nom, sport, statut, ROI, bankroll actuelle et nombre de paris. Cliquez pour voir le détail.",
    placement: "right",
  },
  {
    target: '[data-tour="campaign-menu"]',
    title: "Menu actions",
    content: "Actions disponibles via le menu (⋮) : Mettre en pause, Dupliquer, Archiver ou Supprimer la campagne.",
    placement: "left",
  },
];

export const campaignDetailTour: TourStep[] = [
  {
    target: '[data-tour="campaign-header"]',
    title: "En-tête de campagne",
    content: "Nom de la campagne, statut actuel et actions rapides : pause/reprise, rafraîchir les recommandations, menu d'actions.",
    placement: "bottom",
  },
  {
    target: '[data-tour="stats-cards"]',
    title: "Cartes statistiques",
    content: "Vue d'ensemble : nombre total de paris, taux de réussite, ROI et bankroll actuelle vs initiale.",
    placement: "bottom",
  },
  {
    target: '[data-tour="period-selector"]',
    title: "Sélecteur de période",
    content: "Filtrez l'affichage par période : 7 jours, 14 jours ou tout l'historique de la campagne.",
    placement: "bottom",
  },
  {
    target: '[data-tour="bankroll-chart"]',
    title: "Graphique bankroll",
    content: "Évolution de votre bankroll au fil du temps. Survolez pour voir les valeurs exactes à chaque date.",
    placement: "top",
  },
  {
    target: '[data-tour="campaign-params"]',
    title: "Paramètres",
    content: "Cliquez pour afficher les paramètres de la campagne : bankroll initiale, mise, edge minimum, cotes min/max.",
    placement: "bottom",
  },
  {
    target: '[data-tour="recommendations"]',
    title: "Recommandations",
    content: "Paris proposés par l'algorithme selon vos critères. Chaque proposition montre les équipes, probabilité, edge et mise suggérée.",
    placement: "top",
  },
  {
    target: '[data-tour="accept-btn"]',
    title: "Accepter une recommandation",
    content: "Cliquez pour ajouter ce pari à votre campagne. Il passera automatiquement en statut 'En cours'.",
    placement: "bottom",
  },
  {
    target: '[data-tour="tickets-section"]',
    title: "Tickets de la campagne",
    content: "Liste de tous les paris : proposés, en cours, gagnés, perdus. Mettez à jour les résultats quand le match est terminé.",
    placement: "top",
  },
  {
    target: '[data-tour="tickets-view-toggle"]',
    title: "Vue Kanban / Liste",
    content: "Changez l'affichage des tickets entre vue kanban (colonnes par statut) et vue liste (tableau détaillé).",
    placement: "bottom",
  },
];

export const portfolioTour: TourStep[] = [
  {
    target: '[data-tour="view-toggle"]',
    title: "Modes de vue",
    content: "Trois vues disponibles : Kanban (colonnes par statut), Liste (tableau détaillé avec tri), ou par Campagne.",
    placement: "bottom",
  },
  {
    target: '[data-tour="search-bar"]',
    title: "Barre de recherche",
    content: "Recherchez un pari par nom d'équipe ou de joueur pour le retrouver rapidement.",
    placement: "bottom",
  },
  {
    target: '[data-tour="period-filters"]',
    title: "Filtres de période",
    content: "Filtrez vos paris par période : 7 jours, 30 jours, 90 jours ou dates personnalisées.",
    placement: "bottom",
  },
  {
    target: '[data-tour="result-filters"]',
    title: "Filtres de résultat",
    content: "Filtrez par statut : Tous, Gagné, Perdu, En attente, Annulé, etc.",
    placement: "bottom",
  },
  {
    target: '[data-tour="tag-filters"]',
    title: "Filtres de tags",
    content: "Filtrez par origine du pari : ALGO (algorithme), MANUEL, SCANNER ou COMBI (combiné).",
    placement: "bottom",
  },
  {
    target: '[data-tour="kpis"]',
    title: "Indicateurs clés",
    content: "KPIs essentiels : ROI, taux de réussite, mise totale, P&L, CLV moyen et nombre de paris sur la période.",
    placement: "bottom",
  },
  {
    target: '[data-tour="clv-column"]',
    title: "CLV (Closing Line Value)",
    content: "Mesure si vous avez obtenu de meilleures cotes que la clôture du marché. Un CLV positif signifie que vous captez de la valeur.",
    placement: "left",
  },
  {
    target: '[data-tour="bets-table"]',
    title: "Tableau des paris",
    content: "Liste détaillée de tous vos paris avec tri par colonne. Cliquez sur un pari pour voir ses détails complets.",
    placement: "top",
  },
  {
    target: '[data-tour="add-bet-btn"]',
    title: "Ajouter un pari",
    content: "Ajoutez un pari manuellement (saisie libre) ou recherchez-le depuis le scanner pour l'importer.",
    placement: "bottom",
  },
];

export const backtestTour: TourStep[] = [
  {
    target: '[data-tour="params-card"]',
    title: "Paramètres de simulation",
    content: "Configurez votre simulation : bankroll initiale, mise (%), edge minimum, confiance minimum, cotes min/max.",
    placement: "bottom",
  },
  {
    target: '[data-tour="combo-toggle"]',
    title: "Mode combiné",
    content: "Activez pour simuler des paris combinés avec des paramètres dédiés : nombre de legs max, cotes min/max combo.",
    placement: "bottom",
  },
  {
    target: '[data-tour="run-btn"]',
    title: "Lancer le backtest",
    content: "Lancez la simulation historique sur les données passées pour tester votre stratégie avant de l'appliquer en réel.",
    placement: "bottom",
  },
  {
    target: '[data-tour="results-stats"]',
    title: "Résultats",
    content: "Statistiques de la simulation : nombre de paris, taux de réussite, ROI et bankroll finale après simulation.",
    placement: "bottom",
  },
  {
    target: '[data-tour="bankroll-chart"]',
    title: "Courbe de bankroll",
    content: "Évolution de la bankroll simulée au fil des paris historiques. Visualisez les drawdowns et la tendance globale.",
    placement: "top",
  },
];

export const settingsTour: TourStep[] = [
  {
    target: '[data-tour="profile-card"]',
    title: "Votre profil",
    content: "Votre avatar, nom d'affichage et plan actuel. Les statistiques de votre compte sont affichées en dessous.",
    placement: "right",
  },
  {
    target: '[data-tour="tab-account"]',
    title: "Onglet Compte",
    content: "Modifiez votre nom d'affichage, email et préférences de notification pour chaque type d'alerte.",
    placement: "bottom",
  },
  {
    target: '[data-tour="tab-security"]',
    title: "Onglet Sécurité",
    content: "Changez votre mot de passe. L'indicateur de force vous guide vers un mot de passe sécurisé (majuscule + minuscule + chiffre).",
    placement: "bottom",
  },
  {
    target: '[data-tour="tab-plan"]',
    title: "Onglet Plan & Facturation",
    content: "Comparez les plans Free, Pro et Elite. Upgradez pour débloquer plus de campagnes et fonctionnalités avancées.",
    placement: "bottom",
  },
  {
    target: '[data-tour="tab-privacy"]',
    title: "Onglet Confidentialité",
    content: "Zone dangereuse : suppression définitive et irréversible de votre compte et toutes vos données.",
    placement: "bottom",
  },
];

/** Map module name → tour steps */
export const TOUR_MAP: Record<string, TourStep[]> = {
  dashboard: dashboardTour,
  scanner: scannerTour,
  campaigns: campaignsTour,
  "campaign-detail": campaignDetailTour,
  portfolio: portfolioTour,
  backtest: backtestTour,
  settings: settingsTour,
};

/** Map route path → module name */
export function getModuleFromPath(path: string): string | null {
  if (path === "/" || path === "/dashboard") return "dashboard";
  if (path === "/scanner") return "scanner";
  if (path === "/campaign") return "campaigns";
  if (path.startsWith("/campaign/")) return "campaign-detail";
  if (path === "/portfolio") return "portfolio";
  if (path === "/backtest") return "backtest";
  if (path === "/settings" || path === "/parametres") return "settings";
  return null;
}
