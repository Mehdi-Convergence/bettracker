import { Link } from "react-router-dom";
import FooterLegal from "@/components/FooterLegal";

export default function MentionsLegales() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#4f8cff] rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" className="w-[14px] h-[14px]">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <span className="font-extrabold text-[15px] tracking-tight text-slate-900">
              Bet<span className="text-[#4f8cff]">Tracker</span>
            </span>
          </div>
          <Link
            to="/login"
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors no-underline flex items-center gap-1"
          >
            ← Retour
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto py-12 px-6">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Mentions légales</h1>
          <p className="text-sm text-slate-400 mb-10">Dernière mise à jour : mars 2026</p>

          <div className="flex flex-col gap-10">

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">1. Éditeur du service</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                BetTracker est un service édité par [Nom société / Nom du porteur de projet],
                domicilié à [adresse complète], France.<br />
                E-mail de contact : <a href="mailto:contact@betracker.fr" className="text-[#4f8cff] no-underline hover:underline">contact@betracker.fr</a><br />
                Numéro SIRET : [À compléter]
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">2. Hébergeur</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                OVH SAS<br />
                2 rue Kellermann<br />
                59100 Roubaix, France<br />
                Tél. : +33 9 72 10 10 07<br />
                <a href="https://www.ovhcloud.com" target="_blank" rel="noopener noreferrer" className="text-[#4f8cff] no-underline hover:underline">www.ovhcloud.com</a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">3. Directeur de la publication</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                [Prénom Nom] — <a href="mailto:contact@betracker.fr" className="text-[#4f8cff] no-underline hover:underline">contact@betracker.fr</a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">4. Propriété intellectuelle</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                L'ensemble des contenus présents sur BetTracker (textes, graphiques, logos, algorithmes, code source)
                est la propriété exclusive de BetTracker et est protégé par les lois françaises et internationales
                relatives à la propriété intellectuelle. Toute reproduction, représentation ou diffusion, totale
                ou partielle, sans autorisation écrite préalable est interdite.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">5. Avertissement — Jeu responsable</h2>
              <div className="text-sm text-slate-600 leading-relaxed bg-amber-50 border border-amber-200 rounded-xl p-5">
                <p className="font-semibold text-amber-800 mb-2">Information importante</p>
                <p>
                  BetTracker est un outil d'analyse statistique destiné exclusivement à des fins
                  informatives et éducatives. Il ne constitue pas un conseil financier, fiscal ou
                  d'investissement, ni une incitation à parier.
                </p>
                <p className="mt-3">
                  <strong>Le jeu d'argent est interdit aux mineurs de moins de 18 ans.</strong>{" "}
                  Les jeux d'argent et de hasard peuvent être dangereux : pertes d'argent, conflits
                  familiaux, addiction.
                </p>
                <p className="mt-3">
                  Pour toute aide, contactez <strong>Joueurs Info Service</strong> au{" "}
                  <strong>09 74 75 13 13</strong> (service gratuit, 7j/7, 8h-2h) ou rendez-vous sur{" "}
                  <a href="https://www.joueurs-info-service.fr" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline">
                    joueurs-info-service.fr
                  </a>.
                </p>
              </div>
            </section>

          </div>
        </div>
      </main>

      <FooterLegal />
    </div>
  );
}
