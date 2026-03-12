import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import "../styles/landing.css";

export default function Landing() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
              <em>edge</em>.<br />
              Pas avec l{"'"}instinct.
            </h1>

            <p className="lp-hero-subtitle lp-fade-up lp-fade-up-delay-1">
              BetTracker analyse les matchs en temps r&eacute;el, calcule votre edge
              sur les bookmakers et vous propose uniquement les paris &agrave; valeur positive.
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
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                En savoir plus
              </a>
            </div>

            <p className="lp-hero-caption lp-fade-up lp-fade-up-delay-3">
              3 jours gratuits &middot; Aucune carte bancaire
            </p>
          </div>

          {/* App mockup */}
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

              <div className="lp-mock-body">
                <div className="lp-mock-sidebar" aria-hidden="true">
                  <div className="lp-mock-sidebar-logo">
                    <div className="lp-mock-sidebar-logo-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" width="11" height="11" aria-hidden="true">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                    </div>
                    <span className="lp-mock-sidebar-logo-text">Bet<span>Tracker</span></span>
                  </div>
                  <span className="lp-mock-sidebar-section">Analyse</span>
                  <div className="lp-mock-nav-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" aria-hidden="true">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                    </svg>
                    Dashboard
                  </div>
                  <div className="lp-mock-nav-item active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" aria-hidden="true">
                      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                    </svg>
                    Scanner
                  </div>
                  <span className="lp-mock-sidebar-section">Paris</span>
                  <div className="lp-mock-nav-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" aria-hidden="true">
                      <path d="M2 20h20M5 20V8l7-5 7 5v12" />
                    </svg>
                    Tickets
                    <span className="lp-mock-nav-badge">3</span>
                  </div>
                  <div className="lp-mock-nav-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" aria-hidden="true">
                      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
                    </svg>
                    Campagnes
                  </div>
                </div>

                <div className="lp-mock-scanner" aria-hidden="true">
                  <div className="lp-mock-scanner-header">
                    <span className="lp-mock-scanner-title">14 matchs &middot; Edge d&eacute;tect&eacute;</span>
                    <span className="lp-mock-scanner-btn">Scanner</span>
                  </div>
                  <div className="lp-mock-scanner-list">
                    <div className="lp-mock-match-card selected">
                      <div className="lp-mock-match-league">
                        <span>&#127934;</span> ATP Indian Wells R4
                      </div>
                      <div className="lp-mock-match-teams">Sinner vs Fritz</div>
                      <div className="lp-mock-match-odds">
                        <div className="lp-mock-odd edge">1.65 <small style={{ fontSize: "8px" }}>+5.8%</small></div>
                        <div className="lp-mock-odd dash">&mdash;</div>
                        <div className="lp-mock-odd">2.30</div>
                      </div>
                    </div>
                    <div className="lp-mock-match-card">
                      <div className="lp-mock-match-league">
                        <span>&#9917;</span> Bundesliga J27
                      </div>
                      <div className="lp-mock-match-teams">Bayern vs Dortmund</div>
                      <div className="lp-mock-match-odds">
                        <div className="lp-mock-odd edge">1.58 <small style={{ fontSize: "8px" }}>+4.1%</small></div>
                        <div className="lp-mock-odd">3.90</div>
                        <div className="lp-mock-odd">5.20</div>
                      </div>
                    </div>
                    <div className="lp-mock-match-card">
                      <div className="lp-mock-match-league">
                        <span>&#127934;</span> ATP Indian Wells QF
                      </div>
                      <div className="lp-mock-match-teams">Zverev vs Alcaraz</div>
                      <div className="lp-mock-match-odds">
                        <div className="lp-mock-odd">1.95</div>
                        <div className="lp-mock-odd dash">&mdash;</div>
                        <div className="lp-mock-odd edge-away">1.85 <small style={{ fontSize: "8px" }}>+7.2%</small></div>
                      </div>
                    </div>
                    <div className="lp-mock-match-card">
                      <div className="lp-mock-match-league">
                        <span>&#9917;</span> Premier League J30
                      </div>
                      <div className="lp-mock-match-teams">Arsenal vs Man. City</div>
                      <div className="lp-mock-match-odds">
                        <div className="lp-mock-odd">2.40</div>
                        <div className="lp-mock-odd edge">3.50 <small style={{ fontSize: "8px" }}>+3.4%</small></div>
                        <div className="lp-mock-odd">2.90</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lp-mock-detail" aria-hidden="true">
                  <div>
                    <div className="lp-mock-detail-title">Jannik Sinner vs Taylor Fritz</div>
                    <div className="lp-mock-detail-sub">ATP Indian Wells &middot; R4 &middot; Court central</div>
                  </div>

                  <div className="lp-mock-proba-row">
                    <div className="lp-mock-proba-card winner">
                      <div className="lp-mock-proba-label">Sinner</div>
                      <div className="lp-mock-proba-value">67.2%</div>
                      <div className="lp-mock-edge-badge">edge +5.8%</div>
                    </div>
                    <div className="lp-mock-proba-card">
                      <div className="lp-mock-proba-label">Nul</div>
                      <div className="lp-mock-proba-value" style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>&mdash;</div>
                    </div>
                    <div className="lp-mock-proba-card">
                      <div className="lp-mock-proba-label">Fritz</div>
                      <div className="lp-mock-proba-value">32.8%</div>
                    </div>
                  </div>

                  <div className="lp-mock-stats-row">
                    <div className="lp-mock-stat-card">
                      <div className="lp-mock-stat-label">Forme Sinner</div>
                      <div className="lp-mock-stat-value">V V V D V</div>
                    </div>
                    <div className="lp-mock-stat-card">
                      <div className="lp-mock-stat-label">Forme Fritz</div>
                      <div className="lp-mock-stat-value">V D V D V</div>
                    </div>
                    <div className="lp-mock-stat-card">
                      <div className="lp-mock-stat-label">Cote</div>
                      <div className="lp-mock-stat-value green">1.65</div>
                    </div>
                    <div className="lp-mock-stat-card">
                      <div className="lp-mock-stat-label">EV</div>
                      <div className="lp-mock-stat-value green">+1.74</div>
                    </div>
                  </div>
                </div>
              </div>
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
            <div className="lp-feature-visual">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                <rect x="2" y="2" width="20" height="20" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
              </svg>
              <span>Capture du scanner</span>
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
            <div className="lp-feature-visual">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                <rect x="2" y="2" width="20" height="20" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
              </svg>
              <span>Capture du backtest</span>
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
            <div className="lp-feature-visual">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                <rect x="2" y="2" width="20" height="20" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
              </svg>
              <span>Capture des campagnes</span>
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
                <span className="lp-feature-badge">Elite</span>
              </div>
              <h3 className="lp-feature-title">Posez vos questions, obtenez des r&eacute;ponses</h3>
              <p className="lp-feature-desc">
                &laquo;&nbsp;Quelle est ma meilleure strat&eacute;gie ATP&nbsp;?&nbsp;&raquo;, &laquo;&nbsp;Analyse mon ROI ce mois-ci&nbsp;&raquo;. L&rsquo;IA Analyste conna&icirc;t votre historique, vos campagnes et vos r&eacute;sultats pour vous fournir des insights personnalis&eacute;s.
              </p>
            </div>
            <div className="lp-feature-visual">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                <rect x="2" y="2" width="20" height="20" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
              </svg>
              <span>Capture de l&rsquo;IA Analyste</span>
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
              &laquo;&nbsp;Avant BetTracker je pariais &agrave; l&rsquo;instinct. Depuis 3 mois j&rsquo;utilise le scanner
              et mon ROI s&rsquo;est nettement am&eacute;lior&eacute;. Le backtest m&rsquo;a vraiment aid&eacute; &agrave; comprendre quelles
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
              pr&eacute;cis et BetTracker s&eacute;lectionne automatiquement. +4% ROI ce trimestre sans y passer mes soir&eacute;es.&nbsp;&raquo;
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
          <h2 className="lp-section-title">Simple et transparent</h2>
          <p className="lp-section-desc">Commencez gratuitement, passez au Pro quand vous &ecirc;tes pr&ecirc;t.</p>
        </div>

        <div className="lp-billing-toggle">
          <button
            type="button"
            className={`lp-billing-option ${billing === "monthly" ? "active" : ""}`}
            onClick={() => setBilling("monthly")}
            aria-pressed={billing === "monthly"}
          >
            Mensuel
          </button>
          <button
            className={`lp-billing-toggle-btn ${billing === "annual" ? "annual" : ""}`}
            onClick={() => setBilling(billing === "monthly" ? "annual" : "monthly")}
            type="button"
            aria-label="Basculer entre mensuel et annuel"
          >
            <span className="lp-billing-toggle-thumb" />
          </button>
          <button
            type="button"
            className={`lp-billing-option ${billing === "annual" ? "active" : ""}`}
            onClick={() => setBilling("annual")}
            aria-pressed={billing === "annual"}
          >
            Annuel
          </button>
          {billing === "annual" && <span className="lp-billing-badge">-20%</span>}
        </div>

        <div className="lp-pricing-grid">
          <div className="lp-plan-card">
            <div className="lp-plan-name">Free</div>
            <div className="lp-plan-desc">Pour d&eacute;couvrir BetTracker</div>
            <div className="lp-plan-price">
              <span className="lp-plan-currency">EUR</span>
              <span className="lp-plan-amount">0</span>
              <span className="lp-plan-period">/mois</span>
            </div>
            <div className="lp-plan-annual-note">3 jours &mdash; toutes les features</div>
            <div className="lp-plan-divider" />
            <ul className="lp-plan-features">
              <li className="lp-plan-feature">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                Scanner IA (acc&egrave;s complet 3j)
              </li>
              <li className="lp-plan-feature">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                Portfolio &amp; Dashboard
              </li>
              <li className="lp-plan-feature">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                Backtest historique
              </li>
              <li className="lp-plan-feature">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                Aucune CB requise
              </li>
            </ul>
            <Link to="/login" className="lp-plan-cta">Essayer gratuitement</Link>
          </div>

          <div className="lp-plan-card popular">
            <span className="lp-plan-popular-badge">Le plus populaire</span>
            <div className="lp-plan-name">Pro</div>
            <div className="lp-plan-desc">Pour le parieur s&eacute;rieux</div>
            <div className="lp-plan-price">
              <span className="lp-plan-currency">EUR</span>
              <span className="lp-plan-amount">{proPrice}</span>
              <span className="lp-plan-period">/mois</span>
            </div>
            <div className="lp-plan-annual-note">
              {billing === "annual" ? "Soit 276 EUR/an (\u00e9conomisez 72 EUR)" : ""}
            </div>
            <div className="lp-plan-divider" />
            <ul className="lp-plan-features">
              <li className="lp-plan-feature">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                Scanner IA illimit&eacute;
              </li>
              <li className="lp-plan-feature">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                Portfolio &amp; Dashboard
              </li>
              <li className="lp-plan-feature">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                Backtest historique complet
              </li>
              <li className="lp-plan-feature">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                Tickets &amp; export
              </li>
            </ul>
            <Link to="/login" className="lp-plan-cta primary">Commencer avec Pro</Link>
          </div>

          <div className="lp-plan-card">
            <div className="lp-plan-name">Elite</div>
            <div className="lp-plan-desc">Pour les professionnels</div>
            <div className="lp-plan-price">
              <span className="lp-plan-currency">EUR</span>
              <span className="lp-plan-amount">{elitePrice}</span>
              <span className="lp-plan-period">/mois</span>
            </div>
            <div className="lp-plan-annual-note">
              {billing === "annual" ? "Soit 660 EUR/an (\u00e9conomisez 168 EUR)" : ""}
            </div>
            <div className="lp-plan-divider" />
            <ul className="lp-plan-features">
              <li className="lp-plan-feature">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                Tout ce qu&rsquo;inclut Pro
              </li>
              <li className="lp-plan-feature">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                Campagnes automatis&eacute;es
              </li>
              <li className="lp-plan-feature">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                IA Analyste
              </li>
              <li className="lp-plan-feature">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                Support prioritaire
              </li>
            </ul>
            <Link to="/login" className="lp-plan-cta">Commencer avec Elite</Link>
          </div>
        </div>

        <div className="lp-plan-comparison">
          <table className="lp-plan-comparison-table">
            <thead>
              <tr>
                <th className="col-feature">Fonctionnalit&eacute;</th>
                <th>Free</th>
                <th className="col-pro">Pro</th>
                <th className="col-elite">Elite</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="col-feature">Scanner IA</td>
                <td><span style={{ color: "#f59e0b", fontSize: "11px", fontWeight: 600 }}>3 jours</span></td>
                <td><span style={{ color: "#12b76a" }} aria-hidden="true">&#10003;</span></td>
                <td><span style={{ color: "#12b76a" }} aria-hidden="true">&#10003;</span></td>
              </tr>
              <tr>
                <td className="col-feature">Dashboard &amp; Portfolio</td>
                <td><span style={{ color: "#f59e0b", fontSize: "11px", fontWeight: 600 }}>3 jours</span></td>
                <td><span style={{ color: "#12b76a" }} aria-hidden="true">&#10003;</span></td>
                <td><span style={{ color: "#12b76a" }} aria-hidden="true">&#10003;</span></td>
              </tr>
              <tr>
                <td className="col-feature">Backtest historique</td>
                <td><span style={{ color: "#f59e0b", fontSize: "11px", fontWeight: 600 }}>3 jours</span></td>
                <td><span style={{ color: "#12b76a" }} aria-hidden="true">&#10003;</span></td>
                <td><span style={{ color: "#12b76a" }} aria-hidden="true">&#10003;</span></td>
              </tr>
              <tr>
                <td className="col-feature">Tickets &amp; export</td>
                <td><span style={{ color: "rgba(255,255,255,0.2)" }} aria-hidden="true">&#10007;</span></td>
                <td><span style={{ color: "#12b76a" }} aria-hidden="true">&#10003;</span></td>
                <td><span style={{ color: "#12b76a" }} aria-hidden="true">&#10003;</span></td>
              </tr>
              <tr>
                <td className="col-feature">Campagnes automatis&eacute;es</td>
                <td><span style={{ color: "rgba(255,255,255,0.2)" }} aria-hidden="true">&#10007;</span></td>
                <td><span style={{ color: "rgba(255,255,255,0.2)" }} aria-hidden="true">&#10007;</span></td>
                <td><span style={{ color: "#12b76a" }} aria-hidden="true">&#10003;</span></td>
              </tr>
              <tr>
                <td className="col-feature">IA Analyste</td>
                <td><span style={{ color: "rgba(255,255,255,0.2)" }} aria-hidden="true">&#10007;</span></td>
                <td><span style={{ color: "rgba(255,255,255,0.2)" }} aria-hidden="true">&#10007;</span></td>
                <td><span style={{ color: "#12b76a" }} aria-hidden="true">&#10003;</span></td>
              </tr>
              <tr>
                <td className="col-feature">Support prioritaire</td>
                <td><span style={{ color: "rgba(255,255,255,0.2)" }} aria-hidden="true">&#10007;</span></td>
                <td><span style={{ color: "rgba(255,255,255,0.2)" }} aria-hidden="true">&#10007;</span></td>
                <td><span style={{ color: "#12b76a" }} aria-hidden="true">&#10003;</span></td>
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
              a: "Non. L\u2019essai de 3 jours est enti\u00e8rement gratuit et ne n\u00e9cessite aucune carte bancaire. Vous pouvez tester toutes les fonctionnalit\u00e9s sans engagement.",
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
            Commencer gratuitement &mdash; 3 jours
          </Link>
          <Link to="/login" className="lp-btn-cta-secondary">
            D&eacute;j&agrave; un compte&nbsp;? Se connecter
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-footer-grid">
          <div>
            <a href="#" className="lp-navbar-logo" style={{ marginBottom: "12px", display: "inline-flex" }}>
              <div className="lp-navbar-logo-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden="true">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <span className="lp-navbar-logo-text">Bet<span>Tracker</span></span>
            </a>
            <p className="lp-footer-brand-desc">
              D&eacute;tectez les value bets en temps r&eacute;el avec un mod&egrave;le ML entra&icirc;n&eacute; sur 7 ans de donn&eacute;es.
              Pilotez vos campagnes avec edge et discipline.
            </p>
          </div>

          <div>
            <div className="lp-footer-col-title">Produit</div>
            <div className="lp-footer-links">
              <a href="#features">Fonctionnalit&eacute;s</a>
              <a href="#tarifs">Tarifs</a>
              <a href="#temoignages">T&eacute;moignages</a>
              <a href="#faq">FAQ</a>
            </div>
          </div>

          <div>
            <div className="lp-footer-col-title">Tarifs</div>
            <div className="lp-footer-links">
              <a href="#tarifs">Plan Free</a>
              <a href="#tarifs">Plan Pro &mdash; 29&nbsp;EUR/mois</a>
              <a href="#tarifs">Plan Elite &mdash; 69&nbsp;EUR/mois</a>
            </div>
          </div>

          <div>
            <div className="lp-footer-col-title">L&eacute;gal</div>
            <div className="lp-footer-links">
              <Link to="/mentions-legales">Mentions l&eacute;gales</Link>
              <Link to="/cgu">CGU</Link>
              <Link to="/confidentialite">Politique de confidentialit&eacute;</Link>
            </div>
          </div>
        </div>

        <div className="lp-footer-bottom">
          <span className="lp-footer-copy">
            &copy; {new Date().getFullYear()} BetTracker. Tous droits r&eacute;serv&eacute;s. Jouer comporte des risques &mdash; 18+.
          </span>
          <div className="lp-footer-legal">
            <Link to="/cgu">CGU</Link>
            <Link to="/confidentialite">Confidentialit&eacute;</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
