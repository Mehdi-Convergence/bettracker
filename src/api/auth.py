"""Authentication API endpoints."""

import logging
import random
import secrets
import threading
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

import bcrypt
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
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
    TwoFactorEmailDisableRequest,
    TwoFactorEmailEnableRequest,
    TwoFactorEmailSendRequest,
    TwoFactorLoginRequest,
    TwoFactorPreferredMethodRequest,
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

AVATAR_DIR = Path("uploads/avatars")
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2 Mo


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
    """Create a new user account with a 7-day free trial, or reactivate an inactive one."""
    email_lower = body.email.lower()

    # Check active account
    existing_active = db.query(User).filter(User.email == email_lower, User.is_active == True).first()
    if existing_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Inscription impossible. Vérifiez vos informations.")

    # Check inactive account — reactivate instead of creating a duplicate
    existing_inactive = db.query(User).filter(User.email == email_lower, User.is_active == False).first()
    if existing_inactive:
        existing_inactive.is_active = True
        existing_inactive.hashed_password = _hash_password(body.password)
        existing_inactive.display_name = body.display_name
        existing_inactive.tier = "free"
        existing_inactive.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=settings.TRIAL_DAYS)
        token = secrets.token_urlsafe(32)
        existing_inactive.email_verification_token = token
        db.commit()
        db.refresh(existing_inactive)
        user = existing_inactive
    else:
        user = User(
            email=email_lower,
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

    user = db.query(User).filter(User.email == email_lower).first()

    # Email inconnu : reponse neutre sans incrementer le compteur (anti-enumeration)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe incorrect")

    # Compte inactif : verifier le mdp puis retourner une reponse specifique
    if not user.is_active:
        if _verify_password(body.password, user.hashed_password):
            cache_delete(fail_key)
            cache_delete(lock_key)
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={
                    "detail": "Votre compte est inactif. Reactivez-le en souscrivant a un abonnement.",
                    "inactive": True,
                    "user_id": user.id,
                    "email": user.email,
                },
            )
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
    totp_active = getattr(user, "totp_enabled", False)
    email_2fa_active = getattr(user, "email_2fa_enabled", False)
    if totp_active or email_2fa_active:
        login_token = _create_login_2fa_token(user.id)
        available_methods = []
        if totp_active:
            available_methods.append("totp")
        if email_2fa_active:
            available_methods.append("email")
        preferred = getattr(user, "preferred_2fa_method", None) or (available_methods[0] if available_methods else "totp")
        return JSONResponse(content={
            "requires_2fa": True,
            "login_token": login_token,
            "available_methods": available_methods,
            "preferred_method": preferred,
        })

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

    # Si 2FA active, demander le code
    totp_active = getattr(user, "totp_enabled", False)
    email_2fa_active = getattr(user, "email_2fa_enabled", False)
    if totp_active or email_2fa_active:
        login_token = _create_login_2fa_token(user.id)
        available_methods = []
        if totp_active:
            available_methods.append("totp")
        if email_2fa_active:
            available_methods.append("email")
        preferred = getattr(user, "preferred_2fa_method", None) or (available_methods[0] if available_methods else "totp")
        return JSONResponse(content={
            "requires_2fa": True,
            "login_token": login_token,
            "available_methods": available_methods,
            "preferred_method": preferred,
        })

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


@router.post("/auth/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload or replace the current user's profile picture."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier doit etre une image")

    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Image trop volumineuse (max 2 Mo)")

    try:
        from PIL import Image  # type: ignore[import-untyped]

        img = Image.open(BytesIO(content))
        img = img.convert("RGB")
        w, h = img.size
        size = min(w, h)
        left = (w - size) // 2
        top = (h - size) // 2
        img = img.crop((left, top, left + size, top + size))
        img = img.resize((200, 200), Image.LANCZOS)
    except Exception:
        raise HTTPException(status_code=400, detail="Impossible de traiter l'image")

    filename = f"{user.id}_{uuid.uuid4().hex[:8]}.jpg"
    filepath = AVATAR_DIR / filename

    try:
        img.save(filepath, "JPEG", quality=85)
    except Exception:
        raise HTTPException(status_code=500, detail="Erreur lors de la sauvegarde de l'image")

    # Supprime l'ancien avatar si existant
    if user.avatar_url:
        old_path = Path(user.avatar_url.lstrip("/"))
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    user.avatar_url = f"/uploads/avatars/{filename}"
    db.commit()

    return {"avatar_url": user.avatar_url}


@router.delete("/auth/avatar")
async def delete_avatar(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Remove the current user's profile picture."""
    if user.avatar_url:
        old_path = Path(user.avatar_url.lstrip("/"))
        if old_path.exists():
            old_path.unlink(missing_ok=True)
        user.avatar_url = None
        db.commit()
    return {"detail": "Avatar supprime"}


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
        email_2fa_enabled=getattr(user, "email_2fa_enabled", False),
        preferred_2fa_method=getattr(user, "preferred_2fa_method", None),
        avatar_url=getattr(user, "avatar_url", None),
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
        "email_2fa_enabled": getattr(user, "email_2fa_enabled", False),
        "preferred_2fa_method": getattr(user, "preferred_2fa_method", None),
        "avatar_url": getattr(user, "avatar_url", None),
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
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur invalide")

    method = body.method or "totp"

    if method == "totp":
        if not getattr(user, "totp_enabled", False):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="TOTP non active pour cet utilisateur")
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(body.code, valid_window=1):
            cache_incr("auth:2fa_errors_24h", ttl=86400)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Code 2FA invalide")

    elif method == "email":
        if not getattr(user, "email_2fa_enabled", False):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="2FA email non active pour cet utilisateur")
        cache_key = f"email_2fa_login:{user.id}"
        stored_code = cache_get(cache_key)
        if not stored_code or stored_code != body.code:
            cache_incr("auth:2fa_errors_24h", ttl=86400)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Code 2FA invalide ou expire")
        cache_delete(cache_key)

    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Methode 2FA invalide")

    access_token = create_access_token(user.id, user.token_version)
    refresh_token = create_refresh_token(user.id, user.token_version)

    response = JSONResponse(content={
        "access_token": access_token,
        "token_type": "bearer",
        "user": _user_response_dict(user),
    })
    _set_refresh_cookie(response, refresh_token)
    return response


@router.post("/auth/2fa/email/send")
@limiter.limit("3/minute")
def send_2fa_email_login_code(request: Request, body: TwoFactorEmailSendRequest, db: Session = Depends(get_db)):
    """Envoie un code 2FA par email lors du login (requiert un login_token dans le body)."""
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
    if not user or not getattr(user, "email_2fa_enabled", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur invalide ou 2FA email non active")

    code = f"{random.randint(100000, 999999)}"
    cache_set(f"email_2fa_login:{user.id}", code, ttl=300)

    from src.services.email import send_login_code_email
    threading.Thread(target=send_login_code_email, args=(user.email, user.display_name, code), daemon=True).start()

    return {"detail": "Code envoye"}


@router.post("/auth/2fa/email/setup")
def setup_email_2fa(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Genere et envoie un code de validation pour activer le 2FA par email."""
    if getattr(user, "email_2fa_enabled", False):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA email deja active")

    code = f"{random.randint(100000, 999999)}"
    cache_set(f"email_2fa_setup:{user.id}", code, ttl=600)

    from src.services.email import send_login_code_email
    threading.Thread(target=send_login_code_email, args=(user.email, user.display_name, code), daemon=True).start()

    return {"detail": "Code envoye par email"}


@router.post("/auth/2fa/email/verify")
def verify_email_2fa(
    body: TwoFactorEmailEnableRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Verifie le code et active le 2FA par email."""
    cache_key = f"email_2fa_setup:{user.id}"
    stored_code = cache_get(cache_key)

    if not stored_code or stored_code != body.code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code invalide ou expire")

    cache_delete(cache_key)

    user.email_2fa_enabled = True
    if not getattr(user, "preferred_2fa_method", None):
        user.preferred_2fa_method = "email"
    db.commit()

    return {"detail": "2FA par email active"}


@router.delete("/auth/2fa/email")
def disable_email_2fa(
    body: TwoFactorEmailDisableRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Desactive le 2FA par email apres verification du mot de passe."""
    if not getattr(user, "email_2fa_enabled", False):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA email non active")

    if not _verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Mot de passe incorrect")

    user.email_2fa_enabled = False
    # Si la methode preferee etait email, basculer sur totp si dispo, sinon None
    if getattr(user, "preferred_2fa_method", None) == "email":
        user.preferred_2fa_method = "totp" if getattr(user, "totp_enabled", False) else None
    db.commit()

    return {"detail": "2FA par email desactive"}


@router.put("/auth/2fa/preferred")
def set_preferred_2fa_method(
    body: TwoFactorPreferredMethodRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Definit la methode 2FA preferee de l'utilisateur."""
    if body.method == "totp" and not getattr(user, "totp_enabled", False):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP non active")
    if body.method == "email" and not getattr(user, "email_2fa_enabled", False):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA email non active")

    user.preferred_2fa_method = body.method
    db.commit()

    return {"detail": "Methode preferee mise a jour"}
