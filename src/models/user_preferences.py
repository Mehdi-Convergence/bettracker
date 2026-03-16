"""User preferences for functional settings (bankroll, notifications, display)."""

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class UserPreferences(Base, TimestampMixin):
    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)

    # ── Bankroll globale ──
    initial_bankroll: Mapped[float] = mapped_column(default=1000.0)
    default_stake: Mapped[float] = mapped_column(default=30.0)
    stake_as_percentage: Mapped[bool] = mapped_column(default=False)
    stake_percentage: Mapped[float] = mapped_column(default=2.0)
    daily_stop_loss: Mapped[float] = mapped_column(default=10.0)
    stop_loss_unit: Mapped[str] = mapped_column(String(5), default="pct")  # "pct" | "eur"
    low_bankroll_alert: Mapped[float] = mapped_column(default=200.0)

    # ── Notifications in-app — 5 events ──
    notif_new_ticket: Mapped[bool] = mapped_column(default=True)
    notif_stop_loss: Mapped[bool] = mapped_column(default=True)
    notif_smart_stop: Mapped[bool] = mapped_column(default=True)
    notif_campaign_ending: Mapped[bool] = mapped_column(default=True)
    notif_low_bankroll: Mapped[bool] = mapped_column(default=True)

    # ── Partage de tickets ──
    share_pseudo: Mapped[str] = mapped_column(String(50), default="")
    share_show_stake: Mapped[bool] = mapped_column(default=False)
    share_show_gain_euros: Mapped[bool] = mapped_column(default=True)
    share_show_bookmaker: Mapped[bool] = mapped_column(default=True)
    share_show_clv: Mapped[bool] = mapped_column(default=True)

    # ── Affichage & Langue ──
    theme: Mapped[str] = mapped_column(String(10), default="light")  # light / dark / auto
    language: Mapped[str] = mapped_column(String(5), default="fr")  # fr / en / es
    currency: Mapped[str] = mapped_column(String(5), default="EUR")  # EUR / GBP / USD / CHF
    odds_format: Mapped[str] = mapped_column(String(15), default="decimal")  # decimal / fractional / american
    default_tickets_view: Mapped[str] = mapped_column(String(15), default="kanban")  # kanban / list / campaign
    default_campaigns_view: Mapped[str] = mapped_column(String(15), default="grid")  # grid / kanban

    # -- Dashboard v2 layout (JSON) --
    dashboard_layout: Mapped[str | None] = mapped_column(Text, default=None)

    def __repr__(self) -> str:
        return f"<UserPreferences user_id={self.user_id}>"
