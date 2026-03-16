# BetTracker - Strategie Affiliations & Partenariats Bookmakers

> Derniere mise a jour : Mars 2026

## Contexte

BetTracker est un SaaS de detection de value bets. Chaque utilisateur qui utilise notre scanner va **placer des paris chez un bookmaker**. C'est un flux naturel d'affiliation : on detecte le value bet, l'utilisateur clique pour parier, on touche une commission.

---

## 1. Bookmakers agrees ANJ en France (2026)

16 operateurs agrees. Seuls ceux-ci sont legaux pour l'affiliation en France.

| Bookmaker | Programme affiliation | Modele | Commission estimee | Priorite |
|-----------|----------------------|--------|-------------------|----------|
| **Betclic** | BeAffiliates | CPA + RevShare | CPA 65-90 EUR/joueur, RS 30-40% | HAUTE |
| **Winamax** | Winamax Affiliation | CPA | CPA sur 1er depot (nego directe) | HAUTE |
| **Unibet** (ex-Parions Sport) | Gambling Affiliation | CPA + RevShare | CPA ~40-80 EUR, RS ~25-35% | HAUTE |
| **PMU** | Gambling Affiliation | CPA + RevShare | CPA ~30-50 EUR | MOYENNE |
| **Bwin** | Gambling Affiliation | CPA + RevShare | RS 15-25% | MOYENNE |
| **Betsson** | Betsson Affiliates | CPA + RevShare | RS 25-40% | MOYENNE |
| **Netbet** | Netbet Affiliates | CPA + RevShare | CPA ~40-60 EUR | MOYENNE |
| **Vbet** | Vbet Partners | CPA + RevShare | RS 25-35% | BASSE |
| **Pokerstars Sports** | Stars Affiliates | CPA + RevShare | RS 20-35% | BASSE |
| **Genybet** | Gambling Affiliation | CPA | CPA ~20-40 EUR | BASSE (turf) |
| **Feelingbet** | Gambling Affiliation | CPA | CPA ~20-30 EUR | BASSE |
| **Daznbet** | A contacter | A negocier | Nouveau, potentiel nego | BASSE |
| **Circusbet** | A contacter | A negocier | - | BASSE |
| **Olybet** | A contacter | A negocier | - | BASSE |
| **Yes or No** | A contacter | A negocier | - | BASSE |
| **Vibrez** | Pas encore ouvert | - | - | - |

> **Note** : Parions Sport en Ligne fusionne avec Unibet (mars 2026). Traiter comme un seul operateur.

---

## 2. Plateformes d'affiliation intermediaires

Plutot que de contacter chaque bookmaker individuellement, passer par des plateformes qui agregent plusieurs programmes.

| Plateforme | Bookmakers couverts | Avantage |
|-----------|---------------------|----------|
| **Gambling Affiliation** | Unibet, Bwin, PMU, Genybet, Feelingbet | Leader EU, un seul compte pour tout |
| **BeAffiliates** | Betclic (sport, turf, poker) | Programme direct Betclic |
| **Winamax Affiliation** | Winamax uniquement | Contact direct : affiliation@winamax.fr |
| **AffPapa** | Multi-bookmakers internationaux | Place de marche, bon pour negocier |

### Recommandation

1. S'inscrire sur **Gambling Affiliation** en priorite (couvre 5+ books d'un coup)
2. S'inscrire sur **BeAffiliates** (Betclic = top 3 France)
3. Contacter **Winamax** directement (top 1 France en volume)

---

## 3. Modeles de remuneration

### CPA (Cost Per Acquisition)
- On touche un montant fixe par nouveau joueur qui s'inscrit + fait un 1er depot
- **Avantage** : revenu immediat et previsible
- **Inconvenient** : one-shot, pas de recurrence
- **Fourchette France** : 30 EUR a 90 EUR par joueur selon le book

### Revenue Share (RevShare)
- On touche un % des revenus nets generes par le joueur refere, a vie
- **Avantage** : revenu recurrent, effet boule de neige
- **Inconvenient** : lent au debut, depend de l'activite du joueur
- **Fourchette France** : 25% a 40% des Net Gaming Revenue

### Hybride
- CPA reduit + RevShare reduit (ex: 30 EUR CPA + 20% RS)
- **Recommande pour BetTracker** : on a des utilisateurs actifs (value bettors = joueurs reguliers)

### Quel modele choisir ?

**RevShare ou Hybride** est le meilleur choix pour BetTracker car :
- Nos utilisateurs sont des parieurs serieux et reguliers (pas du one-shot)
- Un value bettor actif genere beaucoup plus de volume qu'un joueur casual
- Sur 12 mois, un RevShare a 35% sur un joueur actif >> un CPA a 80 EUR

---

## 4. Integration dans BetTracker

### 4.1. Points d'integration naturels (ou placer les liens)

| Emplacement | Description | Impact estime |
|-------------|-------------|---------------|
| **Scanner — bouton "Parier"** | Lien affilie vers le bookmaker qui a la meilleure cote | TRES FORT |
| **Scanner — cotes multi-bookmakers** | Chaque cote est un lien affilie vers le book | FORT |
| **Onboarding** | "Quel bookmaker utilisez-vous ?" → lien inscription | FORT |
| **Portfolio — ajout de pari** | "Pas encore de compte chez X ? Inscrivez-vous" | MOYEN |
| **Page Parametres** | Section "Mes bookmakers" avec liens d'inscription | MOYEN |
| **Page comparateur de cotes** (a creer) | Comparateur temps reel avec liens affilies | FORT |
| **Emails de notification** | "Value bet detecte chez Betclic" → lien affilie | MOYEN |
| **Landing page** | Tableau comparatif des bookmakers recommandes | MOYEN |

### 4.2. Experience utilisateur

```
Scanner detecte un value bet
  → Affiche les cotes de chaque bookmaker
  → Bouton "Placer ce pari" a cote de la meilleure cote
  → Redirect vers le bookmaker via lien affilie (avec deep link si dispo)
  → Si l'utilisateur n'a pas de compte → page inscription via notre lien
```

### 4.3. Implementation technique

- Stocker les liens affilies par bookmaker dans la config/DB (pas en dur dans le code)
- Tracking : parametre `?btag=XXXXX` ou `?affid=XXXXX` selon le book
- Dashboard admin : suivi des clics et conversions par bookmaker
- Respecter les obligations legales ANJ (mention "publicite", lien vers joueurs-info-service.fr)

---

## 5. Autres sources de revenus (hors affiliation bookmaker)

### 5.1. Affiliation Odds API / Data providers

| Partenaire | Type | Revenu potentiel |
|-----------|------|------------------|
| **The Odds API** | Referral programme | Commission sur les referrals |
| **OpticOdds** | Partenariat data | Potentiel nego si volume |

### 5.2. Tipster marketplace (moyen terme)

- Les utilisateurs Elite partagent leurs campagnes gagnantes
- BetTracker prend une commission sur les abonnements aux tipsters
- Modele : 20-30% de la fee du tipster

### 5.3. White-label / API (long terme)

- Vendre l'acces API a d'autres sites/apps de paris
- Licence du moteur ML a des tipsters pros ou des sites media
- Pricing : par requete ou abonnement mensuel

### 5.4. Contenu sponsorise

- Articles/analyses sponsorises par des bookmakers sur la landing/blog
- Bannieres dans le scanner (non intrusif)
- Pricing : CPM ou forfait mensuel

---

## 6. Obligations legales (France)

### ANJ — Regles pour les affilies

- **Mention obligatoire** : "Publicite" visible sur tout contenu promotionnel
- **Lien joueurs-info-service.fr** : obligatoire sur toute page avec promotion de jeu
- **Interdiction** : promouvoir des bookmakers non agrees ANJ
- **Interdiction** : cibler les mineurs
- **Interdiction** : promettre des gains certains
- **Declaration** : les revenus d'affiliation sont imposables (BIC ou IS selon la structure)

### RGPD

- Ne pas partager les donnees personnelles des utilisateurs avec les bookmakers
- Le tracking se fait uniquement via cookies/liens affilies, pas via export de donnees

### Mention a afficher

```
Les paris sportifs comportent des risques. Jouez responsablement.
Interdits aux moins de 18 ans. joueurs-info-service.fr — 09 74 75 13 13 (appel non surtaxe).
```

---

## 7. Estimation de revenus

### Hypotheses

| Metrique | Valeur |
|----------|--------|
| Utilisateurs actifs (Pro + Elite) | 500 |
| % qui cliquent sur un lien affilie | 30% (150 users) |
| % qui s'inscrivent via notre lien | 40% (60 nouveaux joueurs/mois) |
| Taux de conversion global | 12% |

### Scenario CPA pur

| | Mensuel | Annuel |
|---|---------|--------|
| 60 inscriptions x 65 EUR CPA moyen | 3 900 EUR | 46 800 EUR |

### Scenario RevShare (apres montee en charge)

| | Mensuel | Annuel |
|---|---------|--------|
| 300 joueurs actifs x 15 EUR/mois NGR moyen x 30% RS | 1 350 EUR | 16 200 EUR |
| Apres 12 mois (cumul 700+ joueurs actifs) | ~3 150 EUR | ~37 800 EUR |

### Scenario hybride (recommande)

| | Mensuel (mois 1) | Mensuel (mois 12) | Annuel cumule |
|---|-------------------|-------------------|---------------|
| CPA (30 EUR) + RS (20%) | 1 800 EUR + 300 EUR | 1 800 EUR + 2 100 EUR | ~35 000 EUR |

> Ces chiffres sont conservateurs. Un SaaS de value betting avec un bon taux d'engagement peut faire beaucoup plus.

---

## 8. Plan d'action

### Phase 1 — Setup (Semaine 1-2)

- [ ] S'inscrire sur Gambling Affiliation
- [ ] S'inscrire sur BeAffiliates (Betclic)
- [ ] Contacter Winamax (affiliation@winamax.fr)
- [ ] Obtenir les liens affilies + parametres de tracking
- [ ] Choisir le modele (hybride recommande)

### Phase 2 — Integration technique (Semaine 3-4)

- [ ] Creer une table `affiliate_links` en DB (bookmaker, url, btag, modele, actif)
- [ ] Ajouter les liens affilies dans le Scanner (bouton "Parier chez X")
- [ ] Ajouter les liens dans la page de comparaison de cotes
- [ ] Ajouter la mention legale ANJ sur toutes les pages concernees
- [ ] Dashboard admin : tracking clics affilies

### Phase 3 — Optimisation (Mois 2-3)

- [ ] A/B test des placements (scanner vs page dediee vs email)
- [ ] Negocier des deals custom avec les top 3 books (Betclic, Winamax, Unibet)
- [ ] Ajouter un comparateur de bonus d'inscription
- [ ] Landing page dediee "Meilleurs bookmakers pour le value betting"

### Phase 4 — Scale (Mois 4+)

- [ ] Contacter les bookmakers restants (Netbet, Betsson, Vbet...)
- [ ] Explorer les deals exclusifs (bonus special BetTracker)
- [ ] Lancer la tipster marketplace
- [ ] Explorer le white-label API

---

## 9. Bookmakers prioritaires — Resume

### Tier 1 (a integrer en premier)

| Book | Pourquoi | Programme |
|------|----------|-----------|
| **Betclic** | Top 3 France, bon CPA, bonne UX | BeAffiliates |
| **Winamax** | #1 en volume France, forte marque | Winamax Affiliation |
| **Unibet** | Ex-Parions Sport, enorme base FDJ | Gambling Affiliation |

### Tier 2 (mois 2-3)

| Book | Pourquoi | Programme |
|------|----------|-----------|
| **PMU** | Incontournable pour le turf + paris sportifs | Gambling Affiliation |
| **Bwin** | Marque internationale reconnue | Gambling Affiliation |
| **Betsson** | Bon RS, marque solide | Betsson Affiliates |
| **Netbet** | Bon CPA, bonne offre sport | Netbet Affiliates |

### Tier 3 (optionnel)

| Book | Pourquoi | Programme |
|------|----------|-----------|
| Vbet | Niche, communaute armenienne/EU de l'Est | Vbet Partners |
| Pokerstars Sports | Extension d'une grosse marque poker | Stars Affiliates |
| Daznbet | Nouveau, potentiel de nego premium | Direct |
| Genybet, Feelingbet, etc. | Volume faible, a evaluer | Gambling Affiliation |

---

## Sources

- [Liste operateurs agrees ANJ](https://anj.fr/offre-de-jeu-et-marche/operateurs-agrees)
- [Gambling Affiliation — Paris Sportifs](https://www.gambling-affiliation.com/en/sports-betting-campaigns)
- [BeAffiliates (Betclic)](https://www.beaffiliates.fr/)
- [Winamax Affiliation](https://www.winamax.fr/affiliation_accueil)
- [AffPapa — Best Betting Affiliate Programs 2026](https://affpapa.com/best-sports-betting-affiliate-programs/)
- [Business of Apps — Betting Affiliates](https://www.businessofapps.com/affiliate/betting/)
