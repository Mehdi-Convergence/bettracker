import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import "../styles/landing.css";

export default function Landing() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const proPrice = billing === "monthly" ? "29" : "23";
  const elitePrice = billing === "monthly" ? "69" : "55";

  function toggleFaq(index: number) {
    setOpenFaq(openFaq === index ? null : index);
  }

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const navLinks = [
    { label: "Fonctionnalit\u00e9s", href: "#features" },
    { label: "Tarifs", href: "#tarifs" },
    { label: "T\u00e9moignages", href: "#temoignages" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <div className="landing-page">
      {/* ── NAV ── */}
      <div className="lp-navbar-wrapper">
        <nav className={`lp-navbar${scrolled ? " scrolled" : ""}`}>
          <a href="#" className="lp-navbar-logo">
            <div className="lp-navbar-logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden="true">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <span className="lp-navbar-logo-text">Bet<span>Tracker</span></span>
          </a>

          <div className="lp-navbar-actions">
            <Link to="/login" className="lp-navbar-login">Se connecter</Link>
            <Link to="/login" className="lp-navbar-register">Commencer gratuitement</Link>

            <div className="lp-navbar-hamburger" ref={popoverRef}>
              <button
                type="button"
                className="lp-navbar-hamburger-btn"
                aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(v => !v)}
              >
                <span className={`lp-navbar-bar lp-navbar-bar-top${menuOpen ? " open" : ""}`} />
                <span className={`lp-navbar-bar lp-navbar-bar-mid${menuOpen ? " open" : ""}`} />
                <span className={`lp-navbar-bar lp-navbar-bar-bot${menuOpen ? " open" : ""}`} />
              </button>

              <div className={`lp-navbar-popover${menuOpen ? " open" : ""}`}>
                {navLinks.map((link, idx) => (
                  <div key={link.href}>
                    <a href={link.href} onClick={() => setMenuOpen(false)} className="lp-navbar-popover-link">
                      {link.label}
                    </a>
                    {idx < navLinks.length - 1 && <div className="lp-navbar-popover-sep" />}
                  </div>
                ))}
                <div className="lp-navbar-popover-sep-wide" />
                <div className="lp-navbar-popover-actions">
                  <Link to="/login" onClick={() => setMenuOpen(false)} className="lp-navbar-popover-login">
                    Se connecter
                  </Link>
                  <Link to="/login" onClick={() => setMenuOpen(false)} className="lp-navbar-popover-register">
                    Commencer gratuitement
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </nav>
      </div>

      {/* ── HERO ── */}
      <section className="lp-hero">
        <div className="lp-hero-grid">
          <div className="lp-hero-content">
            <h1 className="lp-hero-title lp-fade-up">
              Pariez avec l{"'"}
              <em>edge</em> et la <em>probabilit&eacute;</em>.<br />
              Pas l{"'"}instinct.
            </h1>

            <p className="lp-hero-subtitle lp-fade-up lp-fade-up-delay-1">
              D&eacute;tectez les value bets en temps r&eacute;el, suivez vos performances
              match par match et pilotez vos campagnes de paris avec un algorithme
              entra&icirc;n&eacute; sur des ann&eacute;es de donn&eacute;es.
            </p>

            <div className="lp-hero-actions lp-fade-up lp-fade-up-delay-2">
              <Link to="/login" className="lp-btn-hero-primary">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                Commencer gratuitement
              </Link>
              <a href="#features" className="lp-btn-hero-secondary">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                  <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
                </svg>
                D&eacute;couvrir
              </a>
            </div>

            <p className="lp-hero-caption lp-fade-up lp-fade-up-delay-3">
              7 jours gratuits &middot; Aucune carte bancaire
            </p>
          </div>

          {/* App screenshot */}
          <div className="lp-mock-wrapper lp-fade-up lp-fade-up-delay-2">
            <div className="lp-mock-browser">
              <div className="lp-mock-chrome">
                <div className="lp-mock-dots" aria-hidden="true">
                  <div className="lp-mock-dot lp-mock-dot-red" />
                  <div className="lp-mock-dot lp-mock-dot-yellow" />
                  <div className="lp-mock-dot lp-mock-dot-green" />
                </div>
                <div className="lp-mock-url">bettracker.fr/scanner</div>
              </div>
              <img src="/screenshots/Hero.png" alt="BetTracker Scanner" className="lp-hero-screenshot" />
            </div>
          </div>
        </div>
      </section>

      {/* ── FONCTIONNALITES ── */}
      <section className="lp-section lp-section-dark" id="features">
        <div className="lp-section-header">
          <span className="lp-section-label">Fonctionnalit&eacute;s</span>
          <h2 className="lp-section-title">Chaque fonctionnalit&eacute;, un avantage concret</h2>
          <p className="lp-section-desc">
            De l&rsquo;analyse des probabilit&eacute;s au suivi de votre ROI, BetTracker couvre l&rsquo;ensemble du workflow du parieur s&eacute;rieux.
          </p>
        </div>

        <div className="lp-feature-rows">
          {/* Scanner IA */}
          <div className="lp-feature-row">
            <div className="lp-feature-text">
              <div className="lp-feature-label">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                Scanner IA
              </div>
              <h3 className="lp-feature-title">D&eacute;tectez les cotes sous-&eacute;valu&eacute;es en temps r&eacute;el</h3>
              <p className="lp-feature-desc">
                Notre mod&egrave;le ML analyse 100+ ligues (football, tennis ATP) et calcule la probabilit&eacute; r&eacute;elle de chaque issue. Quand cette probabilit&eacute; est sup&eacute;rieure &agrave; celle implicite dans la cote du bookmaker, c&rsquo;est une value bet. Chaque match affiche ses features cl&eacute;s&nbsp;: ELO, forme, H2H, blessures.
              </p>
            </div>
            <div className="lp-feature-visual" onClick={() => setLightbox("/screenshots/scanner.png")}>
              <img src="/screenshots/scanner.png" alt="Scanner IA BetTracker" loading="lazy" />
            </div>
          </div>

          {/* Backtest */}
          <div className="lp-feature-row reverse">
            <div className="lp-feature-text">
              <div className="lp-feature-label">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                  <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.67" />
                </svg>
                Backtest historique
              </div>
              <h3 className="lp-feature-title">Validez votre strat&eacute;gie sur 7 ans de donn&eacute;es</h3>
              <p className="lp-feature-desc">
                Testez vos crit&egrave;res (edge min, cote, sport) sur des milliers de matchs historiques avant de risquer votre bankroll. Walk-forward validation, courbe de bankroll, ROI, Sharpe ratio et CLV. 38&nbsp;000+ matchs disponibles.
              </p>
            </div>
            <div className="lp-feature-visual" onClick={() => setLightbox("/screenshots/Backtest.png")}>
              <img src="/screenshots/Backtest.png" alt="Backtest historique BetTracker" loading="lazy" />
            </div>
          </div>

          {/* Campagnes */}
          <div className="lp-feature-row">
            <div className="lp-feature-text">
              <div className="lp-feature-label">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
                </svg>
                Campagnes automatis&eacute;es
                <span className="lp-feature-badge">Elite</span>
              </div>
              <h3 className="lp-feature-title">Automatisez vos paris avec vos crit&egrave;res</h3>
              <p className="lp-feature-desc">
                D&eacute;finissez vos r&egrave;gles (sport, cote min/max, edge minimum, bankroll) et laissez BetTracker s&eacute;lectionner automatiquement les paris qui correspondent. Suivi complet P&amp;L par campagne, historique de chaque pari.
              </p>
            </div>
            <div className="lp-feature-visual" onClick={() => setLightbox("/screenshots/Campagnes.png")}>
              <img src="/screenshots/Campagnes.png" alt="Campagnes automatisees BetTracker" loading="lazy" />
            </div>
          </div>

          {/* IA Analyste */}
          <div className="lp-feature-row reverse">
            <div className="lp-feature-text">
              <div className="lp-feature-label">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                IA Analyste
                <span className="lp-feature-badge">Bient&ocirc;t</span>
              </div>
              <h3 className="lp-feature-title">Posez vos questions, obtenez des r&eacute;ponses</h3>
              <p className="lp-feature-desc">
                &laquo;&nbsp;Quelle est ma meilleure strat&eacute;gie ATP&nbsp;?&nbsp;&raquo;, &laquo;&nbsp;Analyse mon ROI ce mois-ci&nbsp;&raquo;. L&rsquo;IA Analyste conna&icirc;t votre historique, vos campagnes et vos r&eacute;sultats pour vous fournir des insights personnalis&eacute;s.
              </p>
            </div>
            <div className="lp-feature-visual" onClick={() => setLightbox("/screenshots/ia-analyste.png")}>
              <img src="/screenshots/ia-analyste.png" alt="IA Analyste BetTracker" loading="lazy" />
            </div>
          </div>
        </div>
      </section>

      {/* ── TEMOIGNAGES ── */}
      <section className="lp-section lp-section-dark" id="temoignages">
        <div className="lp-section-header">
          <span className="lp-section-label">T&eacute;moignages</span>
          <h2 className="lp-section-title">Ce que disent nos parieurs</h2>
        </div>

        <div className="lp-testimonials-grid">
          <div className="lp-testimonial-card">
            <div className="lp-testimonial-stars" aria-label="5 &eacute;toiles sur 5">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
            <p className="lp-testimonial-text">
              &laquo;&nbsp;Avant BetTracker je pariais &agrave; l&rsquo;instinct. Le scanner m&rsquo;a ouvert les yeux sur
              les value bets. Le backtest m&rsquo;a vraiment aid&eacute; &agrave; comprendre quelles
              strat&eacute;gies fonctionnent.&nbsp;&raquo;
            </p>
            <div className="lp-testimonial-author">
              <div className="lp-testimonial-avatar" style={{ background: "linear-gradient(135deg, #3b5bdb, #7eb8ff)" }} aria-hidden="true">T</div>
              <div>
                <div className="lp-testimonial-name">Thomas L.</div>
                <div className="lp-testimonial-roi">B&ecirc;ta-testeur</div>
              </div>
            </div>
          </div>

          <div className="lp-testimonial-card">
            <div className="lp-testimonial-stars" aria-label="5 &eacute;toiles sur 5">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
            <p className="lp-testimonial-text">
              &laquo;&nbsp;Le scanner tennis ATP est excellent. Il d&eacute;tecte des edges que je n&rsquo;aurais jamais vus moi-m&ecirc;me.
              Les features ELO et surface sont vraiment pertinentes. Meilleur outil que j&rsquo;ai essay&eacute;.&nbsp;&raquo;
            </p>
            <div className="lp-testimonial-author">
              <div className="lp-testimonial-avatar" style={{ background: "linear-gradient(135deg, #12b76a, #3ee09c)" }} aria-hidden="true">A</div>
              <div>
                <div className="lp-testimonial-name">Alexis M.</div>
                <div className="lp-testimonial-roi">B&ecirc;ta-testeur</div>
              </div>
            </div>
          </div>

          <div className="lp-testimonial-card">
            <div className="lp-testimonial-stars" aria-label="5 &eacute;toiles sur 5">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
            <p className="lp-testimonial-text">
              &laquo;&nbsp;Les campagnes Elite changent tout. J&rsquo;ai configur&eacute; une campagne Bundesliga avec des crit&egrave;res
              pr&eacute;cis et BetTracker s&eacute;lectionne automatiquement. Un gain de temps &eacute;norme.&nbsp;&raquo;
            </p>
            <div className="lp-testimonial-author">
              <div className="lp-testimonial-avatar" style={{ background: "linear-gradient(135deg, #f59e0b, #fde68a)" }} aria-hidden="true">J</div>
              <div>
                <div className="lp-testimonial-name">Julie B.</div>
                <div className="lp-testimonial-roi">B&ecirc;ta-testeuse</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TARIFS ── */}
      <section className="lp-section lp-section-dark" id="tarifs">
        <div className="lp-section-header">
          <span className="lp-section-label">Tarifs</span>
          <h2 className="lp-section-title">Simple. Transparent.<br />Sans surprise.</h2>
          <p className="lp-section-desc">7 jours d&rsquo;acc&egrave;s complet. Aucune carte bancaire requise.</p>
          <div className="lp-billing-pill">
            <button
              type="button"
              className={`lp-billing-pill-btn${billing === "monthly" ? " on" : ""}`}
              onClick={() => setBilling("monthly")}
            >
              Mensuel
            </button>
            <button
              type="button"
              className={`lp-billing-pill-btn${billing === "annual" ? " on" : ""}`}
              onClick={() => setBilling("annual")}
            >
              Annuel <span className="lp-billing-pill-badge">&minus;20%</span>
            </button>
          </div>
        </div>

        <div className="lp-pricing-grid">
          {/* Free */}
          <div className="lp-plan-card">
            <div className="lp-plan-name">Free</div>
            <div className="lp-plan-pricing">
              <div className="lp-plan-price-row">
                <span className="lp-plan-currency">&euro;</span>
                <span className="lp-plan-amount">0</span>
              </div>
              <div className="lp-plan-period">pendant 7 jours</div>
              <div className="lp-plan-annual-note">&nbsp;</div>
            </div>
            <div className="lp-plan-desc">
              Acc&egrave;s &agrave; toutes les fonctionnalit&eacute;s pendant 7 jours. Aucune carte bancaire requise.
            </div>
            <Link to="/login" className="lp-plan-cta cta-free">Commencer gratuitement</Link>
            <div className="lp-plan-features-label">Inclus pendant 7 jours</div>
            <ul className="lp-plan-features">
              {["Scanner IA illimit\u00e9", "Portfolio", "Dashboard", "Backtest", "Campagnes", "Partage de tickets", "Export CSV"].map(f => (
                <li className="lp-plan-feature" key={f}>
                  <span className="lp-plan-check green">
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 6 5 9 10 3" /></svg>
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Pro */}
          <div className="lp-plan-card featured">
            <span className="lp-plan-popular-badge">Le plus populaire</span>
            <div className="lp-plan-name pro">Pro</div>
            <div className="lp-plan-pricing">
              <div className="lp-plan-price-row">
                <span className="lp-plan-currency">&euro;</span>
                <span className="lp-plan-amount">{proPrice}</span>
              </div>
              <div className="lp-plan-period">/ mois</div>
              <div className="lp-plan-annual-note">
                {billing === "annual" ? <><span className="lp-green">276&euro;/an</span> &mdash; &eacute;conomisez 72&euro;</> : "\u00a0"}
              </div>
            </div>
            <div className="lp-plan-desc">
              L&rsquo;algo analyse tous les matchs pour vous. Placez selon les recommandations, au bon moment.
            </div>
            <Link to="/login" className="lp-plan-cta cta-pro">Commencer &mdash; Pro</Link>
            <div className="lp-plan-features-label">Inclus</div>
            <ul className="lp-plan-features">
              {[
                { text: "Scanner IA illimit\u00e9", bold: true },
                { text: "Portfolio" },
                { text: "Dashboard" },
                { text: "Backtest" },
                { text: "Partage de tickets" },
              ].map(f => (
                <li className="lp-plan-feature" key={f.text}>
                  <span className="lp-plan-check green">
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 6 5 9 10 3" /></svg>
                  </span>
                  {f.bold ? <strong>{f.text}</strong> : f.text}
                </li>
              ))}
            </ul>
          </div>

          {/* Elite */}
          <div className="lp-plan-card elite">
            <span className="lp-plan-elite-badge">Elite</span>
            <div className="lp-plan-name gold">Elite</div>
            <div className="lp-plan-pricing">
              <div className="lp-plan-price-row">
                <span className="lp-plan-currency">&euro;</span>
                <span className="lp-plan-amount">{elitePrice}</span>
              </div>
              <div className="lp-plan-period">/ mois</div>
              <div className="lp-plan-annual-note">
                {billing === "annual" ? <><span className="lp-green">660&euro;/an</span> &mdash; &eacute;conomisez 168&euro;</> : "\u00a0"}
              </div>
            </div>
            <div className="lp-plan-desc">
              L&rsquo;algo tourne en automatique via les Campagnes. L&rsquo;IA analyse. Vous supervisez.
            </div>
            <Link to="/login" className="lp-plan-cta cta-elite">Commencer &mdash; Elite</Link>
            <div className="lp-plan-features-label">Tout le Pro, et aussi</div>
            <ul className="lp-plan-features">
              {[
                { text: "Campagnes illimit\u00e9es", bold: true },
                { text: "IA Analyste (bient\u00f4t)", bold: true },
                { text: "Support prioritaire" },
                { text: "Acc\u00e8s prioritaire nouvelles features" },
              ].map(f => (
                <li className="lp-plan-feature" key={f.text}>
                  <span className="lp-plan-check gold">
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 6 5 9 10 3" /></svg>
                  </span>
                  {f.bold ? <strong>{f.text}</strong> : f.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Comparaison detaillee */}
        <div className="lp-plan-comparison">
          <h3 className="lp-comp-title">Comparaison d&eacute;taill&eacute;e</h3>
          <table className="lp-plan-comparison-table">
            <thead>
              <tr>
                <th className="col-feature" style={{ width: "42%" }}>Fonctionnalit&eacute;</th>
                <th>Free</th>
                <th className="col-pro">Pro</th>
                <th className="col-elite">Elite</th>
              </tr>
            </thead>
            <tbody>
              <tr className="lp-comp-section-row"><td colSpan={4}>Acc&egrave;s</td></tr>
              <tr>
                <td className="col-feature">Prix mensuel</td>
                <td>0&euro;</td>
                <td className="lp-check-yes">29&euro;/mois</td>
                <td className="lp-check-gold">69&euro;/mois</td>
              </tr>
              <tr>
                <td className="col-feature">Prix annuel (&minus;20%)</td>
                <td>0&euro;</td>
                <td className="lp-check-yes">23&euro;/mois</td>
                <td className="lp-check-gold">55&euro;/mois</td>
              </tr>
              <tr>
                <td className="col-feature">Dur&eacute;e</td>
                <td><span className="lp-comp-note">7 jours</span></td>
                <td className="lp-check-yes">Illimit&eacute;</td>
                <td className="lp-check-gold">Illimit&eacute;</td>
              </tr>
              <tr className="lp-comp-section-row"><td colSpan={4}>Scanner IA</td></tr>
              <tr>
                <td className="col-feature">Scanner IA</td>
                <td className="lp-check-free">&#10003;</td>
                <td className="lp-check-yes">&#10003;</td>
                <td className="lp-check-gold">&#10003;</td>
              </tr>
              <tr>
                <td className="col-feature">Recommandations &amp; analyse</td>
                <td className="lp-check-free">&#10003;</td>
                <td className="lp-check-yes">&#10003;</td>
                <td className="lp-check-gold">&#10003;</td>
              </tr>
              <tr>
                <td className="col-feature">Football + Tennis</td>
                <td className="lp-check-free">&#10003;</td>
                <td className="lp-check-yes">&#10003;</td>
                <td className="lp-check-gold">&#10003;</td>
              </tr>
              <tr className="lp-comp-section-row"><td colSpan={4}>Portfolio &amp; Dashboard</td></tr>
              <tr>
                <td className="col-feature">Dashboard</td>
                <td className="lp-check-free">&#10003;</td>
                <td className="lp-check-yes">&#10003;</td>
                <td className="lp-check-gold">&#10003;</td>
              </tr>
              <tr>
                <td className="col-feature">Portfolio</td>
                <td className="lp-check-free">&#10003;</td>
                <td className="lp-check-yes">&#10003;</td>
                <td className="lp-check-gold">&#10003;</td>
              </tr>
              <tr>
                <td className="col-feature">Export CSV</td>
                <td className="lp-check-no">&times;</td>
                <td className="lp-check-no">&times;</td>
                <td className="lp-check-gold">&#10003;</td>
              </tr>
              <tr>
                <td className="col-feature">Partage de tickets</td>
                <td className="lp-check-no">&times;</td>
                <td className="lp-check-yes">&#10003;</td>
                <td className="lp-check-gold">&#10003;</td>
              </tr>
              <tr className="lp-comp-section-row"><td colSpan={4}>Backtest</td></tr>
              <tr>
                <td className="col-feature">Backtest</td>
                <td className="lp-check-free">&#10003;</td>
                <td className="lp-check-yes">&#10003;</td>
                <td className="lp-check-gold">&#10003;</td>
              </tr>
              <tr className="lp-comp-section-row"><td colSpan={4}>Campagnes &amp; IA</td></tr>
              <tr>
                <td className="col-feature">Campagnes actives</td>
                <td><span className="lp-comp-note">1 campagne</span></td>
                <td className="lp-check-no">&times;</td>
                <td className="lp-check-gold">&#10003; Illimit&eacute;es</td>
              </tr>
              <tr>
                <td className="col-feature">IA Analyste</td>
                <td className="lp-check-no">&times;</td>
                <td className="lp-check-no">&times;</td>
                <td><span className="lp-comp-note">Bient&ocirc;t</span></td>
              </tr>
              <tr className="lp-comp-section-row"><td colSpan={4}>Support</td></tr>
              <tr>
                <td className="col-feature">Support</td>
                <td><span className="lp-comp-note">Standard</span></td>
                <td><span className="lp-comp-note">Standard</span></td>
                <td className="lp-check-gold">&#10003; Prioritaire</td>
              </tr>
              <tr>
                <td className="col-feature">Acc&egrave;s nouvelles features</td>
                <td className="lp-check-no">&times;</td>
                <td className="lp-check-no">&times;</td>
                <td className="lp-check-gold">&#10003; Prioritaire</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="lp-section lp-section-dark" id="faq">
        <div className="lp-section-header">
          <span className="lp-section-label">FAQ</span>
          <h2 className="lp-section-title">Questions fr&eacute;quentes</h2>
        </div>

        <div className="lp-faq-list">
          {[
            {
              q: "Une carte bancaire est-elle requise pour l\u2019essai gratuit\u00a0?",
              a: "Non. L\u2019essai de 7 jours est enti\u00e8rement gratuit et ne n\u00e9cessite aucune carte bancaire. Vous pouvez tester toutes les fonctionnalit\u00e9s sans engagement.",
            },
            {
              q: "Avec quels bookmakers BetTracker est-il compatible\u00a0?",
              a: "BetTracker est compatible avec tous les bookmakers qui proposent des cotes en ligne\u00a0: Bet365, Unibet, Winamax, PMU, Betclic, Pinnacle et bien d\u2019autres. Vous entrez les cotes manuellement ou les retrouvez depuis le scanner.",
            },
            {
              q: "Les campagnes automatis\u00e9es sont-elles incluses dans le plan Pro\u00a0?",
              a: "Non, les campagnes automatis\u00e9es sont une fonctionnalit\u00e9 exclusive au plan Elite. Le plan Pro inclut le scanner, le portfolio, le backtest et les tickets d\u2019acc\u00e8s.",
            },
            {
              q: "Puis-je changer de plan \u00e0 tout moment\u00a0?",
              a: "Oui. Vous pouvez passer de Free \u00e0 Pro, de Pro \u00e0 Elite ou downgrader \u00e0 tout moment depuis les param\u00e8tres de votre compte. Les changements prennent effet imm\u00e9diatement.",
            },
            {
              q: "Pourquoi BetTracker est-il moins cher que ses concurrents\u00a0?",
              a: "Nous avons construit BetTracker de z\u00e9ro avec des technologies modernes qui nous permettent de maintenir des co\u00fbts d\u2019infrastructure bas. Nous pr\u00e9f\u00e9rons proposer un prix accessible et garder nos utilisateurs sur le long terme.",
            },
          ].map((item, i) => (
            <div className="lp-faq-item" key={i}>
              <button
                className="lp-faq-question"
                onClick={() => toggleFaq(i)}
                type="button"
                aria-expanded={openFaq === i}
              >
                {item.q}
                <svg
                  className={`lp-faq-chevron ${openFaq === i ? "open" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="16"
                  height="16"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {openFaq === i && (
                <div className="lp-faq-answer">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="lp-final-cta">
        <h2 className="lp-final-cta-title">Pr&ecirc;t &agrave; parier avec l&rsquo;edge&nbsp;?</h2>
        <p className="lp-final-cta-desc">
          Rejoignez nos parieurs et commencez &agrave; d&eacute;tecter de vraies value bets d&egrave;s aujourd&rsquo;hui.
        </p>
        <div className="lp-final-cta-actions">
          <Link to="/login" className="lp-btn-cta-primary">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            Commencer gratuitement &mdash; 7 jours
          </Link>
          <Link to="/login" className="lp-btn-cta-secondary">
            D&eacute;j&agrave; un compte&nbsp;? Se connecter
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-footer-bottom">
          <span className="lp-footer-copy">
            &copy; {new Date().getFullYear()} BetTracker. Tous droits r&eacute;serv&eacute;s. Jouer comporte des risques &mdash; 18+.
          </span>
          <div className="lp-footer-legal">
            <Link to="/mentions-legales">Mentions l&eacute;gales</Link>
            <Link to="/cgu">CGU</Link>
            <Link to="/confidentialite">Confidentialit&eacute;</Link>
          </div>
        </div>
      </footer>

      {lightbox && (
        <div className="lp-lightbox-overlay" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Apercu" />
        </div>
      )}
    </div>
  );
}
