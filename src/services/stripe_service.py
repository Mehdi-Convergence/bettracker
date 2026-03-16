"""Stripe service — checkout, billing portal, webhook event construction."""

import stripe as _stripe

from src.config import settings


def _client() -> type[_stripe]:
    _stripe.api_key = settings.STRIPE_SECRET_KEY
    return _stripe


def create_checkout_session(
    customer_id: str | None,
    price_id: str,
    user_id: int,
    success_url: str,
    cancel_url: str,
) -> str:
    """Create a Stripe Checkout Session and return the redirect URL."""
    s = _client()
    params: dict = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {"user_id": str(user_id)},
    }
    if customer_id:
        params["customer"] = customer_id
    session = s.checkout.Session.create(**params)
    return session.url


def create_billing_portal_session(customer_id: str, return_url: str) -> str:
    """Create a Stripe Billing Portal Session and return the redirect URL."""
    s = _client()
    session = s.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url


def construct_webhook_event(payload: bytes, sig_header: str):
    """Verify and parse an incoming Stripe webhook event."""
    s = _client()
    return s.Webhook.construct_event(
        payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
    )


def get_tier_from_price(price_id: str) -> str:
    """Map a Stripe price ID to a user tier."""
    if price_id in (settings.STRIPE_PRO_PRICE_ID, settings.STRIPE_PRO_ANNUAL_PRICE_ID):
        return "pro"
    if price_id in (settings.STRIPE_PREMIUM_PRICE_ID, settings.STRIPE_PREMIUM_ANNUAL_PRICE_ID):
        return "premium"
    return "free"
