"""Stripe integration endpoints: checkout, billing portal, webhooks."""

import logging

import stripe as _stripe_lib
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.config import settings
from src.database import get_db
from src.models.user import User
from src.services.stripe_service import (
    construct_webhook_event,
    create_billing_portal_session,
    create_checkout_session,
    get_tier_from_price,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["stripe"])


class CheckoutBody(BaseModel):
    tier: str  # "pro" | "premium"
    billing: str = "monthly"  # "monthly" | "annual"


# ── POST /stripe/checkout ────────────────────────────────────────────────────


@router.post("/stripe/checkout")
def checkout(
    body: CheckoutBody,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Create a Stripe Checkout Session for upgrading to pro or premium."""
    if body.tier == "pro":
        price_id = settings.STRIPE_PRO_ANNUAL_PRICE_ID if body.billing == "annual" else settings.STRIPE_PRO_PRICE_ID
    elif body.tier == "premium":
        price_id = settings.STRIPE_PREMIUM_ANNUAL_PRICE_ID if body.billing == "annual" else settings.STRIPE_PREMIUM_PRICE_ID
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tier invalide (pro ou premium)")

    if not price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe non configuré",
        )

    success_url = settings.FRONTEND_URL + "/settings?tab=billing&success=1"
    cancel_url = settings.FRONTEND_URL + "/settings?tab=billing"

    try:
        url = create_checkout_session(
            customer_id=current_user.stripe_customer_id,
            price_id=price_id,
            user_id=current_user.id,
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except _stripe_lib.StripeError as exc:
        logger.error("Stripe checkout error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Erreur Stripe lors de la création de la session",
        ) from exc

    return {"url": url}


# ── POST /stripe/portal ──────────────────────────────────────────────────────


@router.post("/stripe/portal")
def billing_portal(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Create a Stripe Billing Portal session for managing an existing subscription."""
    if not current_user.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun abonnement Stripe actif",
        )

    return_url = settings.FRONTEND_URL + "/settings?tab=billing"

    try:
        url = create_billing_portal_session(
            customer_id=current_user.stripe_customer_id,
            return_url=return_url,
        )
    except _stripe_lib.StripeError as exc:
        logger.error("Stripe portal error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Erreur Stripe lors de la création du portail",
        ) from exc

    return {"url": url}


# ── POST /stripe/webhook ─────────────────────────────────────────────────────


@router.post("/stripe/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    """Handle Stripe webhook events (no auth, Stripe signature verified)."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = construct_webhook_event(payload, sig_header)
    except _stripe_lib.SignatureVerificationError as exc:
        logger.warning("Stripe webhook signature invalid: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Signature Stripe invalide",
        ) from exc
    except Exception as exc:
        logger.error("Stripe webhook parse error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload webhook invalide",
        ) from exc

    event_type = event["type"]
    data_obj = event["data"]["object"]

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(db, data_obj)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_updated(db, data_obj)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(db, data_obj)
    else:
        logger.debug("Unhandled Stripe event: %s", event_type)

    return {"status": "ok"}


# ── Internal helpers ─────────────────────────────────────────────────────────


def _handle_checkout_completed(db: Session, session: dict) -> None:
    user_id_str = (session.get("metadata") or {}).get("user_id")
    if not user_id_str:
        logger.warning("checkout.session.completed: missing user_id in metadata")
        return

    user = db.query(User).filter(User.id == int(user_id_str)).first()
    if not user:
        logger.warning("checkout.session.completed: user %s not found", user_id_str)
        return

    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    if customer_id:
        user.stripe_customer_id = customer_id
    if subscription_id:
        user.stripe_subscription_id = subscription_id

    # Resolve tier from the subscription's price
    price_id = _extract_price_id_from_session(session)
    if price_id:
        user.tier = get_tier_from_price(price_id)

    db.commit()
    logger.info("User %s upgraded via checkout — tier=%s", user_id_str, user.tier)


def _handle_subscription_updated(db: Session, subscription: dict) -> None:
    customer_id = subscription.get("customer")
    if not customer_id:
        return

    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        logger.warning("subscription.updated: no user for customer %s", customer_id)
        return

    price_id = _extract_price_id_from_subscription(subscription)
    if price_id:
        user.tier = get_tier_from_price(price_id)
        db.commit()
        logger.info("User %s subscription updated — tier=%s", user.id, user.tier)


def _handle_subscription_deleted(db: Session, subscription: dict) -> None:
    customer_id = subscription.get("customer")
    if not customer_id:
        return

    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        logger.warning("subscription.deleted: no user for customer %s", customer_id)
        return

    user.tier = "free"
    user.stripe_subscription_id = None
    db.commit()
    logger.info("User %s subscription deleted — downgraded to free", user.id)


def _extract_price_id_from_session(session: dict) -> str | None:
    """Try to get the price ID from a checkout.session.completed object."""
    # The session object may have a subscription expand; try line_items first
    line_items = session.get("line_items")
    if line_items:
        data = line_items.get("data", [])
        if data:
            return (data[0].get("price") or {}).get("id")
    return None


def _extract_price_id_from_subscription(subscription: dict) -> str | None:
    """Try to get the price ID from a subscription object."""
    items = subscription.get("items", {}).get("data", [])
    if items:
        return (items[0].get("price") or {}).get("id")
    return None
