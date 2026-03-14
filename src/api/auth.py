"""Authentication API endpoints."""

import logging
import secrets
import threading
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from src.api.deps import (
    _decode_token,
    create_access_token,
    create_refresh_token,
    get_current_user,
)
from src.api.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    OnboardingRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    TourVisitedRequest,
    UpdateProfileRequest,
    UserResponse,
    UserStatsResponse,
)
from src.config import settings
from src.database import get_db
from src.models.password_reset import PasswordResetToken
from src.models.user import User

logger = logging.getLogger(__name__)

from src.rate_limit import limiter

router = APIRouter(tags=["auth"])


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
    db.add(user)
    db.commit()
    db.refresh(user)

    from src.services.email import send_welcome_email
    threading.Thread(target=send_welcome_email, args=(user.email, user.display_name), daemon=True).start()

    return _user_to_response(user)


@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return JWT tokens."""
    user = db.query(User).filter(User.email == body.email.lower(), User.is_active == True).first()
    if not user or not _verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe incorrect")

    return TokenResponse(
        access_token=create_access_token(user.id, user.token_version),
        refresh_token=create_refresh_token(user.id, user.token_version),
    )


@router.post("/auth/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
def refresh(request: Request, body: RefreshRequest, db: Session = Depends(get_db)):
    """Exchange a refresh token for a new access + refresh token pair."""
    payload = _decode_token(body.refresh_token, expected_type="refresh")
    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
    if payload.get("ver") != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expirée")

    return TokenResponse(
        access_token=create_access_token(user.id, user.token_version),
        refresh_token=create_refresh_token(user.id, user.token_version),
    )


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


@router.post("/auth/logout-all", response_model=MessageResponse)
def logout_all(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Invalidate all existing sessions by incrementing token_version."""
    user.token_version += 1
    db.commit()
    return MessageResponse(message="Toutes les sessions ont ete deconnectees")


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
        trial_ends_at=user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        created_at=user.created_at.isoformat() if user.created_at else "",
        onboarding_completed=user.onboarding_completed,
        visited_modules=visited_list,
    )
