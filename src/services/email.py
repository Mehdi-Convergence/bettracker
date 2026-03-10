"""Email service via Resend — transactional emails only."""

import logging

import resend

from src.config import settings

logger = logging.getLogger(__name__)


def _send(to: str, subject: str, html: str) -> bool:
    """Send an email via Resend. Returns True on success, False on failure."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping email to %s: %s", to, subject)
        return False
    try:
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
        })
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception:
        logger.exception("Failed to send email to %s: %s", to, subject)
        return False


def send_welcome_email(email: str, display_name: str) -> bool:
    """Send welcome email after registration."""
    name = display_name or email.split("@")[0]
    html = f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #111318; margin-bottom: 8px;">Bienvenue sur BetTracker, {name} !</h2>
      <p style="color: #3c4149; line-height: 1.6;">
        Votre compte a été créé avec succès. Vous bénéficiez de
        <strong>{settings.TRIAL_DAYS} jours d'essai gratuit</strong> pour découvrir toutes les fonctionnalités.
      </p>
      <p style="color: #3c4149; line-height: 1.6;">
        Commencez par explorer le <strong>Scanner</strong> pour détecter des value bets,
        ou créez votre première <strong>Campagne</strong> pour automatiser votre stratégie.
      </p>
      <a href="{settings.FRONTEND_URL}"
         style="display: inline-block; background: #3b5bdb; color: #fff; padding: 10px 24px;
                border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px;">
        Accéder à BetTracker
      </a>
      <p style="color: #8a919e; font-size: 13px; margin-top: 24px;">
        Si vous n'avez pas créé ce compte, ignorez cet email.
      </p>
    </div>
    """
    return _send(email, "Bienvenue sur BetTracker", html)


def send_reset_password_email(email: str, display_name: str, reset_url: str) -> bool:
    """Send password reset link."""
    name = display_name or email.split("@")[0]
    html = f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #111318; margin-bottom: 8px;">Réinitialisation de mot de passe</h2>
      <p style="color: #3c4149; line-height: 1.6;">
        Bonjour {name}, vous avez demandé la réinitialisation de votre mot de passe.
        Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
      </p>
      <a href="{reset_url}"
         style="display: inline-block; background: #3b5bdb; color: #fff; padding: 10px 24px;
                border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px;">
        Réinitialiser mon mot de passe
      </a>
      <p style="color: #8a919e; font-size: 13px; margin-top: 24px;">
        Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.
      </p>
    </div>
    """
    return _send(email, "Réinitialisation de votre mot de passe — BetTracker", html)
