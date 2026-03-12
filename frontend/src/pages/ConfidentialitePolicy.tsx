import { Link } from "react-router-dom";
import FooterLegal from "@/components/FooterLegal";

export default function ConfidentialitePolicy() {
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
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Politique de confidentialité</h1>
          <p className="text-sm text-slate-400 mb-10">Dernière mise à jour : mars 2026 — Conforme RGPD</p>

          <div className="flex flex-col gap-10">

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">1. Responsable du traitement</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Le responsable du traitement des données personnelles collectées via BetTracker est :<br />
                [Nom société / Porteur de projet], [adresse], France.<br />
                Contact : <a href="mailto:contact@betracker.fr" className="text-[#4f8cff] no-underline hover:underline">contact@betracker.fr</a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">2. Données collectées</h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-3">
                Dans le cadre de l'utilisation du service, nous collectons les données suivantes :
              </p>
              <ul className="text-sm text-slate-600 leading-relaxed list-disc list-inside flex flex-col gap-1.5 pl-2">
                <li><strong>Données d'identification :</strong> adresse e-mail, pseudo (display name)</li>
                <li><strong>Données de compte :</strong> niveau d'abonnement (tier), date d'inscription</li>
                <li><strong>Données d'utilisation :</strong> paris trackés (cotes, montants, résultats), campagnes créées, préférences d'affichage</li>
                <li><strong>Données techniques :</strong> adresse IP (pour la limitation de débit), logs d'accès à l'API</li>
              </ul>
              <p className="text-sm text-slate-600 leading-relaxed mt-3">
                Nous ne collectons pas de données de paiement directement — les transactions
                sont gérées par notre prestataire de paiement tiers.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">3. Finalités du traitement</h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-3">
                Vos données sont traitées pour les finalités suivantes :
              </p>
              <ul className="text-sm text-slate-600 leading-relaxed list-disc list-inside flex flex-col gap-1.5 pl-2">
                <li>Fourniture et gestion du service BetTracker (compte, accès aux fonctionnalités)</li>
                <li>Calcul des statistiques et indicateurs personnalisés (ROI, CLV, performance)</li>
                <li>Envoi de notifications liées au service (alertes value bets, résultats)</li>
                <li>Amélioration du service et détection des abus</li>
                <li>Respect des obligations légales</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">4. Base légale</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Le traitement de vos données repose sur les bases légales suivantes (art. 6 RGPD) :
              </p>
              <ul className="text-sm text-slate-600 leading-relaxed list-disc list-inside flex flex-col gap-1.5 pl-2 mt-3">
                <li><strong>Exécution du contrat :</strong> fourniture du service auquel vous avez souscrit</li>
                <li><strong>Consentement :</strong> pour l'envoi de communications marketing (opt-in)</li>
                <li><strong>Intérêt légitime :</strong> sécurité du service, prévention des fraudes, amélioration du produit</li>
                <li><strong>Obligation légale :</strong> conservation des données comptables et de facturation</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">5. Durée de conservation</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Vos données sont conservées pendant toute la durée de votre abonnement actif, puis pendant
                une période de 3 ans à compter de la clôture de votre compte (à des fins de traçabilité légale).
                Les logs techniques sont conservés 12 mois. Passé ces délais, vos données sont supprimées
                ou anonymisées.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">6. Droits des utilisateurs</h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-3">
                Conformément au RGPD et à la loi Informatique et Libertés, vous disposez des droits suivants :
              </p>
              <ul className="text-sm text-slate-600 leading-relaxed list-disc list-inside flex flex-col gap-1.5 pl-2">
                <li><strong>Droit d'accès :</strong> obtenir une copie de vos données personnelles</li>
                <li><strong>Droit de rectification :</strong> corriger des données inexactes</li>
                <li><strong>Droit à l'effacement :</strong> demander la suppression de votre compte et de vos données</li>
                <li><strong>Droit à la portabilité :</strong> recevoir vos données dans un format structuré</li>
                <li><strong>Droit d'opposition :</strong> vous opposer à certains traitements</li>
                <li><strong>Droit à la limitation :</strong> restreindre le traitement dans certains cas</li>
              </ul>
              <p className="text-sm text-slate-600 leading-relaxed mt-3">
                Pour exercer ces droits, contactez-nous à{" "}
                <a href="mailto:contact@betracker.fr" className="text-[#4f8cff] no-underline hover:underline">contact@betracker.fr</a>.
                Nous nous engageons à répondre dans un délai de 30 jours. Vous avez également le droit
                d'introduire une réclamation auprès de la{" "}
                <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-[#4f8cff] no-underline hover:underline">CNIL</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">7. Cookies</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                BetTracker utilise uniquement des cookies fonctionnels strictement nécessaires au
                fonctionnement du service : authentification (JWT), préférences d'interface. Aucun cookie
                publicitaire ou de suivi tiers n'est déposé. Ces cookies ne requièrent pas de consentement
                préalable (art. 82 de la loi Informatique et Libertés).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-3">8. Contact DPO</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Pour toute question relative à la protection de vos données personnelles ou pour exercer
                vos droits, vous pouvez contacter notre délégué à la protection des données (DPO) à
                l'adresse suivante :{" "}
                <a href="mailto:contact@betracker.fr" className="text-[#4f8cff] no-underline hover:underline">contact@betracker.fr</a>
              </p>
            </section>

          </div>

          <div className="mt-10 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-400">
              Voir aussi :{" "}
              <Link to="/mentions-legales" className="text-[#4f8cff] no-underline hover:underline">Mentions légales</Link>
              {" "}·{" "}
              <Link to="/cgu" className="text-[#4f8cff] no-underline hover:underline">CGU</Link>
            </p>
          </div>
        </div>
      </main>

      <FooterLegal />
    </div>
  );
}
