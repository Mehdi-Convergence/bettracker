import { Link } from "react-router-dom";
import FooterLegal from "@/components/FooterLegal";

export default function CGU() {
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
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Conditions Générales d'Utilisation</h1>
          <p className="text-sm text-slate-400 mb-10">Dernière mise à jour : mars 2026</p>

          <div className="flex flex-col gap-10">

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">1. Objet du service</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                BetTracker est une plateforme en ligne d'analyse statistique et de suivi de paris sportifs.
                Elle propose des outils d'aide à la décision basés sur des modèles algorithmiques, sans
                constituer un opérateur de jeux agréé par l'ANJ (Autorité Nationale des Jeux).
                Les présentes CGU régissent l'accès et l'utilisation du service accessible à l'adresse{" "}
                <a href="https://betracker.fr" target="_blank" rel="noopener noreferrer" className="text-[#4f8cff] no-underline hover:underline">betracker.fr</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">2. Accès au service</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                L'accès au service nécessite la création d'un compte utilisateur avec une adresse e-mail valide
                et un mot de passe sécurisé. <strong>L'utilisation de BetTracker est strictement réservée aux personnes
                majeures (18 ans et plus).</strong> En créant un compte, l'utilisateur certifie être majeur et
                accepte sans réserve les présentes CGU. BetTracker se réserve le droit de suspendre ou
                supprimer tout compte en cas de violation de ces conditions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">3. Utilisation du service</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                BetTracker fournit des analyses statistiques et des indicateurs de probabilité à titre
                informatif uniquement. Ces informations ne constituent en aucun cas un conseil financier,
                un conseil en investissement, ni une incitation à parier. L'utilisateur est seul responsable
                de ses décisions de jeu. BetTracker ne garantit pas les performances passées comme indicateur
                des performances futures.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">4. Compte utilisateur</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                L'utilisateur est responsable de la confidentialité de ses identifiants de connexion.
                Toute activité réalisée depuis son compte lui est attribuée. En cas de compromission
                suspectée, l'utilisateur doit contacter immédiatement BetTracker à{" "}
                <a href="mailto:contact@betracker.fr" className="text-[#4f8cff] no-underline hover:underline">contact@betracker.fr</a>.
                Les comptes inactifs depuis plus de 24 mois pourront être supprimés après notification préalable.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">5. Propriété intellectuelle</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                L'ensemble des éléments constituant le service BetTracker (interface, algorithmes, modèles
                statistiques, données agrégées, marque) est protégé par le droit de la propriété intellectuelle.
                Toute reproduction, extraction, redistribution ou utilisation commerciale sans autorisation
                écrite préalable est formellement interdite.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">6. Limitation de responsabilité</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                BetTracker ne pourra être tenu responsable de toute perte financière, perte de données ou
                préjudice indirect résultant de l'utilisation ou de l'impossibilité d'utiliser le service.
                Le service est fourni "en l'état" et BetTracker ne garantit pas une disponibilité continue
                sans interruption. BetTracker se réserve le droit de modifier, suspendre ou interrompre
                le service à tout moment.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">7. Données personnelles</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                La collecte et le traitement des données personnelles sont détaillés dans notre{" "}
                <Link to="/confidentialite" className="text-[#4f8cff] no-underline hover:underline">
                  Politique de confidentialité
                </Link>
                , conforme au Règlement Général sur la Protection des Données (RGPD) et à la loi
                Informatique et Libertés.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">8. Loi applicable et juridiction</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Les présentes CGU sont soumises au droit français. En cas de litige, les parties s'engagent
                à rechercher une solution amiable avant tout recours judiciaire. À défaut d'accord amiable,
                le tribunal compétent sera celui de Paris, France.
              </p>
            </section>

          </div>
        </div>
      </main>

      <FooterLegal />
    </div>
  );
}
