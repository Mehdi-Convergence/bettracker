# BetTracker — Paramètres
## Documentation Fonctionnelle Exhaustive — v2

---

## 1. Périmètre

**Paramètres** = configuration fonctionnelle de l'application.
**Profil** = informations personnelles, sécurité, Plan & Facturation.

Ces deux modules sont distincts et non redondants.

> Plan & Facturation est dans le Profil (onglet dédié). Les Paramètres ne contiennent aucune référence au plan sauf des badges "locked" avec lien vers Profil → Plan.

---

## 2. Structure — 4 sections

| Section | Contenu |
|---|---|
| **Bankroll globale** | Budget hors campagne, mise par défaut, stop-loss global |
| **Push & Email** | Préférences de notifications par événement |
| **Partage de tickets** | Configuration des cartes de partage |
| **Affichage & Langue** | Thème, langue, devise, format cotes, vues par défaut |

Navigation par ancres dans une sidebar gauche — toutes les sections visibles en scrollant, pas de tabs.

---

## 3. Bankroll globale

### Définition

Budget dédié aux paris placés **hors campagne** (tickets créés depuis le Scanner sans campagne). Entièrement distinct des bankrolls isolées de chaque campagne.

### Champs

| Champ | Type | Obligatoire | Notes |
|---|---|---|---|
| Montant total (€) | Nombre | ✓ | Budget de référence pour tous les paris hors campagne |
| Mise par défaut (€) | Nombre | ✓ | Pré-remplie à la création d'un ticket depuis le Scanner |
| Mise par défaut en % bankroll | Toggle | Non | Si activé : mise = X% de la bankroll courante au lieu d'un montant fixe |
| % mise par défaut | Nombre (%) | Conditionnel | Obligatoire si toggle % activé |
| Stop-loss journalier | Nombre (€ ou %) | Non | Bloque la création de tickets hors campagne si cette perte est atteinte dans la journée |
| Alerte seuil bas (€) | Nombre | Non | Notification quand la bankroll disponible descend sous ce montant |

### Affichage temps réel

Carte en haut de la section :
- Bankroll disponible = montant total − mises en cours
- Montant en jeu
- Barre de progression disponible / total

### Règles métier

1. Isolation totale — la bankroll globale n'est jamais partagée avec les campagnes.
2. Stop-loss journalier hors campagne indépendant des stop-loss de chaque campagne.
3. Bankroll calculée en temps réel : montant total − somme des mises des tickets "En cours" hors campagne.

---

## 4. Push & Email

### Principe

Chaque événement configurable indépendamment sur deux canaux : **Push** (navigateur/mobile) et **Email**.

> Telegram = feature V2. Absent des Paramètres V1.

### Matrice événements × canaux

| Événement | Déclencheur | Push défaut | Email défaut |
|---|---|---|---|
| Nouveau ticket proposé | Campagne génère un ticket à valider | ✓ | ✗ |
| Cote modifiée post-génération | Cote bougée depuis la génération | ✓ | ✗ |
| Ticket expiré | Non traité dans le délai configuré | ✓ | ✗ |
| Stop-loss déclenché | Journalier ou total atteint sur une campagne | ✓ | ✓ |
| Règle d'arrêt intelligente atteinte | Taux réussite ou CLV sous le seuil | ✓ | ✓ |
| Résumé quotidien | Synthèse fin de journée | ✗ | ✓ |
| Fin de campagne imminente | J−3 avant la date de fin | ✓ | ✓ |
| Alerte bankroll globale basse | Bankroll hors campagne sous le seuil | ✓ | ✗ |

### Autres champs

| Champ | Notes |
|---|---|
| Email de réception | Adresse pour les notifs email. Défaut = email du compte |

### Règles métier

1. Notifications Push nécessitent autorisation navigateur/OS — bandeau de demande à la première activation.
2. Résumé quotidien envoyé à 23h30 heure locale, uniquement si au moins un ticket résolu dans la journée.
3. Ces préférences sont les **défauts globaux**. Chaque campagne peut les surcharger dans son Bloc 6 Alertes.

---

## 5. Partage de tickets

### Définition

Génère une **image PNG** d'un ticket à partager sur X/Twitter, copier ou télécharger. Objectif : construire un track record public transparent, générer de la visibilité organique pour BetTracker.

**Tous les tickets sont partageables** — gagné, perdu, en cours. Transparence totale, aucun filtre par statut.

### Où apparaît le bouton Partager

- Card **Kanban Tickets** — icône partage en haut à droite
- **Tableau Liste/Historique** — colonne action de chaque ligne
- **Panel latéral de détail** d'un ticket

### Contenu de la carte générée

| Élément | Configurable | Notes |
|---|---|---|
| Sport + compétition + tour | ✗ | Toujours affiché |
| Match (équipes / joueurs) | ✗ | Toujours affiché |
| Issue pariée | ✗ | Toujours affiché |
| Date | ✗ | Toujours affiché |
| Cote | ✗ | Toujours affiché |
| Edge | ✗ | Toujours affiché |
| Statut (Gagné / Perdu / En cours) | ✗ | Toujours affiché |
| CLV | Toggle ✓ | Crédibilise la qualité long terme |
| Bookmaker | Toggle ✓ | Nom du bookmaker |
| Mise (€) | Toggle ✓ | Certains préfèrent ne pas l'exposer |
| Gain / Perte (€) | Toggle ✓ | Si off : affiche % ROI uniquement |
| Pseudo public | Texte libre | Affiché bas gauche de chaque carte |
| Watermark BetTracker | ✗ forcé on | Non supprimable — com organique |

### Champs de configuration (dans Paramètres)

| Champ | Type | Notes |
|---|---|---|
| Pseudo public affiché | Texte libre | Ex : @MehdiQ_bets |
| Afficher la mise | Toggle | On/Off |
| Afficher le gain/perte en € | Toggle | Si off : % ROI uniquement |
| Afficher le bookmaker | Toggle | On/Off |
| Afficher le CLV | Toggle | Recommandé on |
| Watermark BetTracker | Forcé ✓ | Non modifiable |

### Flow de partage — Modal déclenchée au clic sur Partager

```
1. Clic bouton Partager sur un ticket (Kanban / Liste / Panel détail)
       →
2. Modal s'ouvre avec :
   ├── Aperçu live de la carte (mise à jour en temps réel selon les options)
   ├── Rappel des toggles configurés dans Paramètres
   │   └── Modifiables à la volée pour ce partage uniquement
   │       (ne modifie pas les Paramètres globaux)
   └── 3 boutons d'action :
       ├── 📋 Copier l'image  → PNG dans le presse-papier
       ├── ⬇️ Télécharger    → fichier PNG local
       └── 𝕏 Partager sur X → ouvre twitter.com/intent/tweet
                               avec image pré-attachée + texte pré-rempli
       →
3. Fermeture de la modal
```

### Texte pré-rempli X/Twitter

Format :
```
[emoji statut] [Match] — [Issue] @ [Cote]
Edge : +X% | CLV : +Y%
[Gain/Perte ou "En cours"]

#ValueBetting #BetTracker
```

Exemples :
- `✅ Sinner vs Fritz — Dom @ 1.65 | Edge +5.8% | CLV +3.8% | +19.50€`
- `🔵 Zverev vs Alcaraz — Dom @ 1.85 | Edge +7.2% | En cours`
- `❌ Over 2.5 Combi ×2 @ 2.16 | CLV −1.4% | −20€`

### Design de la carte

- Fond sombre (#0f172a → #1e2535) — contraste élevé, lisible sur toutes plateformes
- Typo : Plus Jakarta Sans pour textes, JetBrains Mono pour données chiffrées
- Badge statut coloré : vert (gagné) / rouge (perdu) / bleu (en cours)
- Watermark BetTracker bas droite — discret mais présent
- Format : 16/9 paysage optimisé Twitter/X card preview

### Règles métier

1. Génération côté client (canvas HTML/JS) — pas d'appel serveur.
2. Ticket "En cours" : champ Gain/Perte affiche "En cours" et badge bleu.
3. Watermark non supprimable en V1 pour tous les plans — contrepartie de la feature gratuite.
4. Le pseudo modifié dans la modal est temporaire pour ce partage uniquement.
5. Les toggles modifiés dans la modal sont également temporaires — ne modifient pas les Paramètres globaux.

---

## 6. Affichage & Langue

### Champs

| Champ | Options | Notes |
|---|---|---|
| Thème | Clair (défaut) / Sombre / Auto (système) | Auto suit le thème OS |
| Langue | Français / English / Español | Langue de l'interface |
| Devise | € / £ / $ / CHF | Cosmétique V1 — affiche le symbole, ne convertit pas |
| Format des cotes | Décimal (1.85) / Fractionnaire (17/20) / Américain (+185) | Affecte toutes les vues |
| Vue par défaut — Tickets | Kanban / Liste / Par campagne | Vue à l'ouverture du module |
| Vue par défaut — Campagnes | Grille / Kanban | Vue à l'ouverture du module |

### Règles métier

1. Changement de thème appliqué immédiatement sans rechargement.
2. Devise cosmétique en V1 — pas de conversion de taux de change.
3. Format des cotes affecte toutes les vues : Scanner, Tickets, Campagnes, cartes de partage.

---

## 7. Règles métier globales

1. **Sauvegarde par section** — chaque section a son propre bouton Sauvegarder. Modification non sauvegardée → confirmation si l'utilisateur quitte.
2. **Paramètres vs Profil** — infos personnelles, email, mot de passe, avatar, Plan & Facturation sont exclusivement dans le Profil.
3. **Paramètres vs Campagnes** — les préférences Paramètres sont les défauts globaux. Chaque campagne peut les surcharger localement (Bloc 6 Alertes).
4. **Features locked** — badge "Pro" ou "Elite" + lien "Upgrader →" → Profil → Plan & Facturation. Pas de tableau des plans dans les Paramètres.
5. **Telegram V2** — aucune référence en V1.
