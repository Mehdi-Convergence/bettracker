"""Email service via Resend — transactional emails only."""

import logging

import resend

from src.config import settings

logger = logging.getLogger(__name__)


def _track_email_sent() -> None:
    """Incremente le compteur quotidien d'emails envoyes (cle Redis email:daily:{date})."""
    try:
        from datetime import datetime, timezone
        from src.cache import cache_incr
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        # TTL 48h pour conserver les stats le lendemain
        cache_incr(f"email:daily:{today}", ttl=172800)
    except Exception:
        pass  # Non-blocking


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
        _track_email_sent()
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


def send_feedback_email(from_email: str, from_name: str, message: str) -> bool:
    """Send a user feedback/support message to the admin."""
    admin_email = settings.ADMIN_EMAIL
    html = f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;
                border: 1px solid #e3e6eb; border-radius: 12px;">
      <h2 style="color: #111318; margin-bottom: 4px;">💬 Nouveau message utilisateur</h2>
      <p style="color: #8a919e; font-size: 13px; margin-top: 0;">BetTracker — Feedback &amp; Support</p>
      <hr style="border: none; border-top: 1px solid #e3e6eb; margin: 16px 0;" />
      <p style="color: #3c4149; font-size: 13px; margin-bottom: 4px;">
        <strong>De :</strong> {from_name} &lt;{from_email}&gt;
      </p>
      <div style="background: #f4f5f7; border-radius: 8px; padding: 16px; margin-top: 12px;
                  color: #111318; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
        {message}
      </div>
      <p style="color: #b0b7c3; font-size: 11px; margin-top: 20px;">
        Répondre directement à cet email pour contacter l'utilisateur.
      </p>
    </div>
    """
    return _send(admin_email, f"[BetTracker] Message de {from_name}", html)


def send_verification_email(to_email: str, display_name: str, verification_url: str) -> bool:
    """Send email verification link after registration."""
    name = display_name or to_email.split("@")[0]
    html = f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #111318; margin-bottom: 8px;">Vérifiez votre adresse email</h2>
      <p style="color: #3c4149; line-height: 1.6;">
        Bonjour {name}, cliquez sur le bouton ci-dessous pour vérifier votre adresse email et sécuriser votre compte BetTracker.
      </p>
      <a href="{verification_url}"
         style="display: inline-block; background: #3b5bdb; color: #fff; padding: 10px 24px;
                border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px;">
        Vérifier mon email
      </a>
      <p style="color: #8a919e; font-size: 13px; margin-top: 24px;">
        Ce lien expire dans 24h. Si vous n'avez pas créé ce compte, ignorez cet email.
      </p>
    </div>
    """
    return _send(to_email, "Vérifiez votre adresse email - BetTracker", html)


def send_login_code_email(to_email: str, display_name: str, code: str) -> bool:
    """Send a 6-digit login code by email."""
    name = display_name or to_email.split("@")[0]
    html = f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #111318; margin-bottom: 8px;">Votre code de connexion</h2>
      <p style="color: #3c4149; line-height: 1.6;">
        Bonjour {name}, voici votre code de connexion BetTracker :
      </p>
      <div style="background: #f4f5f7; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #3b5bdb; font-family: monospace;">
          {code}
        </span>
      </div>
      <p style="color: #8a919e; font-size: 13px;">
        Ce code expire dans 10 minutes. Si vous n'avez pas demande cette connexion, ignorez cet email.
      </p>
    </div>
    """
    return _send(to_email, f"Code de connexion BetTracker : {code}", html)


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
