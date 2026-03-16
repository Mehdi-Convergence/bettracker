"""Authentication API endpoints."""

import logging
import random
import secrets
import threading
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from src.api.deps import (
    _decode_token,
    create_access_token,
    create_refresh_token,
    get_current_user,
)
from src.api.schemas import (
    ChangePasswordRequest,
    EmailCodeRequest,
    EmailCodeVerifyRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    OnboardingRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TourVisitedRequest,
    TwoFactorDisableRequest,
    TwoFactorLoginRequest,
    TwoFactorVerifyRequest,
    UpdateProfileRequest,
    UserResponse,
    UserStatsResponse,
)
from src.cache import cache_delete, cache_get, cache_incr, cache_set
from src.config import settings
from src.database import get_db
from src.models.password_reset import PasswordResetToken
from src.models.user import User

logger = logging.getLogger(__name__)

from src.rate_limit import limiter

router = APIRouter(tags=["auth"])

_REFRESH_COOKIE_MAX_AGE = 30 * 86400  # 30 jours en secondes


def _set_refresh_cookie(response: JSONResponse, refresh_token: str) -> None:
    """Pose le cookie httpOnly contenant le refresh token."""
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=_REFRESH_COOKIE_MAX_AGE,
        path="/api/auth",
    )


def _delete_refresh_cookie(response: JSONResponse) -> None:
    """Supprime le cookie refresh token."""
    response.delete_cookie("refresh_token", path="/api/auth")


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    """Create a new user account with a 7-day free trial."""
    existing = db.query(User).filter(User.email == body.email.lower(), User.is_active == True).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Inscription impossible. Vérifiez vos informations.")

    user = User(
        email=body.email.lower(),
        hashed_password=_hash_password(body.password),
        display_name=body.display_name,
        tier="free",
        trial_ends_at=datetime.now(timezone.utc) + timedelta(days=settings.TRIAL_DAYS),
    )
    token = secrets.token_urlsafe(32)
    user.email_verification_token = token
    db.add(user)
    db.commit()
    db.refresh(user)

    from src.services.email import send_welcome_email, send_verification_email
    threading.Thread(target=send_welcome_email, args=(user.email, user.display_name), daemon=True).start()
    verification_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    threading.Thread(target=send_verification_email, args=(user.email, user.display_name, verification_url), daemon=True).start()

    return _user_to_response(user)


@router.post("/auth/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return access token + set refresh token cookie."""
    email_lower = body.email.lower()
    lock_key = f"login_lock:{email_lower}"
    fail_key = f"login_fails:{email_lower}"

    # Verifie si le compte est verrouille
    if cache_get(lock_key):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Trop de tentatives. Reessayez dans 15 minutes.")

    user = db.query(User).filter(User.email == email_lower, User.is_active == True).first()

    # Email inconnu : reponse neutre sans incrementer le compteur (anti-enumeration)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe incorrect")

    # Mauvais mot de passe : incremente le compteur et verrouille si necessaire
    if not _verify_password(body.password, user.hashed_password):
        fails = cache_incr(fail_key, ttl=900)
        if fails >= 5:
            cache_set(lock_key, "locked", ttl=900)
            cache_delete(fail_key)
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Trop de tentatives. Reessayez dans 15 minutes.")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe incorrect")

    # Login reussi : reset des compteurs
    cache_delete(fail_key)
    cache_delete(lock_key)

    # Si 2FA activé, retourner un token temporaire et demander le code
    if getattr(user, "totp_enabled", False):
        login_token = _create_login_2fa_token(user.id)
        return JSONResponse(content={"requires_2fa": True, "login_token": login_token})

    access_token = create_access_token(user.id, user.token_version)
    refresh_token = create_refresh_token(user.id, user.token_version)

    response = JSONResponse(content={
        "access_token": access_token,
        "token_type": "bearer",
        "user": _user_response_dict(user),
    })
    _set_refresh_cookie(response, refresh_token)
    return response


@router.post("/auth/email-code")
@limiter.limit("3/minute")
def request_email_code(request: Request, body: EmailCodeRequest, db: Session = Depends(get_db)):
    """Send a 6-digit login code by email."""
    email_lower = body.email.lower()
    user = db.query(User).filter(User.email == email_lower, User.is_active == True).first()

    # Toujours retourner succes (anti-enumeration)
    if not user:
        return {"detail": "Si un compte existe avec cet email, un code a ete envoye."}

    # Genere un code a 6 chiffres
    code = f"{random.randint(100000, 999999)}"

    # Stocke dans le cache avec TTL 10 minutes
    cache_key = f"email_code:{email_lower}"
    cache_set(cache_key, code, ttl=600)

    # Reinitialise le compteur de tentatives
    attempts_key = f"email_code_attempts:{email_lower}"
    cache_set(attempts_key, "0", ttl=600)

    # Envoie l'email en thread
    from src.services.email import send_login_code_email
    threading.Thread(target=send_login_code_email, args=(user.email, user.display_name, code), daemon=True).start()

    return {"detail": "Si un compte existe avec cet email, un code a ete envoye."}


@router.post("/auth/email-code/verify")
@limiter.limit("10/minute")
def verify_email_code(request: Request, body: EmailCodeVerifyRequest, db: Session = Depends(get_db)):
    """Verify the 6-digit email code and return tokens."""
    email_lower = body.email.lower()

    # Verifie le nombre de tentatives
    attempts_key = f"email_code_attempts:{email_lower}"
    attempts = int(cache_get(attempts_key) or "0")
    if attempts >= 5:
        cache_delete(f"email_code:{email_lower}")
        cache_delete(attempts_key)
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Trop de tentatives. Demandez un nouveau code.")

    cache_key = f"email_code:{email_lower}"
    stored_code = cache_get(cache_key)

    if not stored_code or stored_code != body.code:
        cache_set(attempts_key, str(attempts + 1), ttl=600)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Code invalide ou expire")

    # Code valide — nettoyage
    cache_delete(cache_key)
    cache_delete(attempts_key)

    user = db.query(User).filter(User.email == email_lower, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Code invalide ou expire")

    # Si 2FA active, demander le code TOTP
    if getattr(user, "totp_enabled", False):
        login_token = _create_login_2fa_token(user.id)
        return JSONResponse(content={"requires_2fa": True, "login_token": login_token})

    # Generation des tokens
    access_token = create_access_token(user.id, user.token_version)
    refresh_token = create_refresh_token(user.id, user.token_version)

    response = JSONResponse(content={
        "access_token": access_token,
        "token_type": "bearer",
        "user": _user_response_dict(user),
    })
    _set_refresh_cookie(response, refresh_token)
    return response


@router.post("/auth/refresh")
@limiter.limit("20/minute")
def refresh(request: Request, db: Session = Depends(get_db)):
    """Exchange a refresh token cookie for a new access + refresh token pair."""
    token_value = request.cookies.get("refresh_token")
    if not token_value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de rafraichissement manquant")

    payload = _decode_token(token_value, expected_type="refresh")
    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
    if payload.get("ver") != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expirée")

    new_access_token = create_access_token(user.id, user.token_version)
    new_refresh_token = create_refresh_token(user.id, user.token_version)

    response = JSONResponse(content={
        "access_token": new_access_token,
        "token_type": "bearer",
    })
    _set_refresh_cookie(response, new_refresh_token)
    return response


@router.post("/auth/logout")
async def logout(request: Request):
    """Supprimer le cookie refresh token (deconnexion simple)."""
    response = JSONResponse(content={"detail": "Deconnecte"})
    _delete_refresh_cookie(response)
    return response


@router.get("/auth/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return _user_to_response(user)


@router.patch("/auth/me", response_model=UserResponse)
def update_profile(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's profile (display_name and/or email)."""
    if body.email is not None:
        new_email = body.email.lower()
        if new_email != user.email:
            existing = db.query(User).filter(User.email == new_email, User.id != user.id, User.is_active == True).first()
            if existing:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cet email est deja utilise")
            user.email = new_email
    if body.display_name is not None:
        user.display_name = body.display_name
    db.commit()
    db.refresh(user)
    return _user_to_response(user)


@router.post("/auth/change-password", response_model=MessageResponse)
@limiter.limit("5/minute")
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password."""
    if not _verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mot de passe actuel incorrect")
    user.hashed_password = _hash_password(body.new_password)
    user.token_version += 1
    db.commit()
    return MessageResponse(message="Mot de passe modifie avec succes")


@router.post("/auth/forgot-password", response_model=MessageResponse)
@limiter.limit("3/minute")
def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """Request a password reset token. Always returns 200 (anti-enumeration)."""
    user = db.query(User).filter(User.email == body.email.lower(), User.is_active == True).first()
    if user:
        token = secrets.token_urlsafe(32)
        reset = PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        db.add(reset)
        db.commit()
        from src.services.email import send_reset_password_email
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        threading.Thread(target=send_reset_password_email, args=(user.email, user.display_name, reset_url), daemon=True).start()
        logger.info("Password reset requested for user_id=%d", user.id)
    return MessageResponse(message="Si un compte existe avec cet email, un lien de reinitialisation a ete envoye.")


@router.post("/auth/reset-password", response_model=MessageResponse)
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """Reset password using a valid token."""
    reset = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token == body.token, PasswordResetToken.used == False)
        .first()
    )
    if not reset:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token invalide ou expire")

    now = datetime.now(timezone.utc)
    expires = reset.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token invalide ou expire")

    user = db.query(User).filter(User.id == reset.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token invalide ou expire")

    user.hashed_password = _hash_password(body.new_password)
    user.token_version += 1
    db.delete(reset)
    db.commit()
    return MessageResponse(message="Mot de passe reinitialise avec succes")


@router.get("/auth/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    """Verify email address using the token sent by email."""
    user = db.query(User).filter(User.email_verification_token == token).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token invalide ou expire")
    user.email_verified = True
    user.email_verification_token = None
    db.commit()
    return {"detail": "Email verifie avec succes"}


@router.post("/auth/resend-verification")
@limiter.limit("2/minute")
def resend_verification(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resend the email verification link to the current user."""
    if current_user.email_verified:
        return {"detail": "Email deja verifie"}
    token = secrets.token_urlsafe(32)
    current_user.email_verification_token = token
    db.commit()
    from src.services.email import send_verification_email
    verification_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    threading.Thread(target=send_verification_email, args=(current_user.email, current_user.display_name, verification_url), daemon=True).start()
    return {"detail": "Email de verification renvoye"}


@router.get("/auth/stats", response_model=UserStatsResponse)
def get_user_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return profile stats for the current user."""
    from src.models.bet import Bet

    bets = db.query(Bet).filter(Bet.is_backtest == False, Bet.user_id == user.id).all()
    settled = [b for b in bets if b.result in ("won", "lost")]
    total_staked = sum(b.stake for b in settled)
    total_pnl = sum(b.profit_loss or 0 for b in settled)
    roi = round((total_pnl / total_staked * 100), 2) if total_staked > 0 else 0.0

    return UserStatsResponse(
        total_bets=len(bets),
        roi_pct=roi,
        member_since=user.created_at.strftime("%b %Y") if user.created_at else "",
        is_active=user.is_active,
    )


@router.delete("/auth/me", response_model=MessageResponse)
def delete_account(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-delete the current user's account."""
    user.is_active = False
    db.commit()
    return MessageResponse(message="Compte desactive")


@router.post("/auth/logout-all")
def logout_all(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Invalidate all existing sessions by incrementing token_version."""
    user.token_version += 1
    db.commit()
    response = JSONResponse(content={"message": "Toutes les sessions ont ete deconnectees"})
    _delete_refresh_cookie(response)
    return response


@router.post("/auth/onboarding", response_model=UserResponse)
def complete_onboarding(
    body: OnboardingRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Complete onboarding: save bankroll + stake and mark as done."""
    from src.models.user_preferences import UserPreferences

    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == user.id).first()
    if not prefs:
        prefs = UserPreferences(user_id=user.id)
        db.add(prefs)
    prefs.initial_bankroll = body.bankroll
    prefs.stake_percentage = body.default_stake_pct
    prefs.stake_as_percentage = True
    user.onboarding_completed = True
    db.commit()
    db.refresh(user)
    return _user_to_response(user)


@router.post("/auth/onboarding/skip", response_model=UserResponse)
def skip_onboarding(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Skip onboarding without saving preferences."""
    user.onboarding_completed = True
    db.commit()
    db.refresh(user)
    return _user_to_response(user)


@router.post("/auth/tour-visited", response_model=MessageResponse)
def mark_tour_visited(
    body: TourVisitedRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a module's tour as visited."""
    current = user.visited_modules or ""
    visited = [m for m in current.split(",") if m]
    if body.module not in visited:
        visited.append(body.module)
        user.visited_modules = ",".join(visited)
        db.commit()
    return MessageResponse(message="ok")


def _user_to_response(user: User) -> UserResponse:
    visited_str = user.visited_modules or ""
    visited_list = [m for m in visited_str.split(",") if m]
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        tier=user.tier,
        is_active=user.is_active,
        is_admin=getattr(user, "is_admin", False),
        trial_ends_at=user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        created_at=user.created_at.isoformat() if user.created_at else "",
        onboarding_completed=user.onboarding_completed,
        visited_modules=visited_list,
        email_verified=getattr(user, "email_verified", False),
        totp_enabled=getattr(user, "totp_enabled", False),
    )


def _user_response_dict(user: User) -> dict:
    """Retourne le dict user pour les reponses JSON de login."""
    visited_str = user.visited_modules or ""
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "tier": user.tier,
        "is_active": user.is_active,
        "is_admin": getattr(user, "is_admin", False),
        "trial_ends_at": user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else "",
        "onboarding_completed": user.onboarding_completed,
        "visited_modules": [m for m in visited_str.split(",") if m],
        "totp_enabled": getattr(user, "totp_enabled", False),
    }


def _create_login_2fa_token(user_id: int) -> str:
    """Cree un token temporaire (5 min) pour la validation 2FA lors du login."""
    from jose import jwt as jose_jwt
    expire = datetime.now(timezone.utc) + timedelta(minutes=5)
    payload = {"sub": str(user_id), "exp": expire, "type": "login_2fa"}
    return jose_jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


# ── Endpoints 2FA ──────────────────────────────────────────────────────────────


@router.post("/auth/2fa/setup")
def setup_2fa(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Genere un secret TOTP et retourne le QR code en base64 pour configuration."""
    import base64
    import io

    import pyotp
    import qrcode

    if getattr(user, "totp_enabled", False):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA deja active")

    secret = pyotp.random_base32()
    user.totp_secret = secret
    db.commit()

    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user.email, issuer_name="BetTracker")

    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_base64 = base64.b64encode(buf.getvalue()).decode()

    return {"secret": secret, "qr_code": f"data:image/png;base64,{qr_base64}"}


@router.post("/auth/2fa/verify")
def verify_2fa(
    body: TwoFactorVerifyRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Verifie le code TOTP et active le 2FA si correct."""
    import pyotp

    if not getattr(user, "totp_secret", None):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA non configure")

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code invalide")

    user.totp_enabled = True
    db.commit()
    return {"detail": "2FA active avec succes"}


@router.delete("/auth/2fa")
def disable_2fa(
    body: TwoFactorDisableRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Desactive le 2FA apres verification du mot de passe et du code TOTP."""
    import pyotp

    if not getattr(user, "totp_enabled", False):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA non active")

    if not _verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Mot de passe incorrect")

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code 2FA invalide")

    user.totp_enabled = False
    user.totp_secret = None
    db.commit()
    return {"detail": "2FA desactive"}


@router.post("/auth/2fa/login")
def login_2fa(body: TwoFactorLoginRequest, db: Session = Depends(get_db)):
    """Finalise le login apres verification du code 2FA (token temporaire requis)."""
    import pyotp
    from jose import JWTError
    from jose import jwt as jose_jwt

    try:
        payload = jose_jwt.decode(body.login_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "login_2fa":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
        user_id = int(payload["sub"])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expire ou invalide")

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user or not getattr(user, "totp_enabled", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur invalide")

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Code 2FA invalide")

    access_token = create_access_token(user.id, user.token_version)
    refresh_token = create_refresh_token(user.id, user.token_version)

    response = JSONResponse(content={
        "access_token": access_token,
        "token_type": "bearer",
        "user": _user_response_dict(user),
    })
    _set_refresh_cookie(response, refresh_token)
    return response
