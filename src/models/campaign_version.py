from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, TimestampMixin


class CampaignVersion(Base, TimestampMixin):
    __tablename__ = "campaign_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    version: Mapped[int]
    snapshot: Mapped[dict] = mapped_column(sa.JSON)
    changed_at: Mapped[datetime]
    change_summary: Mapped[str] = mapped_column(String(500), default="")

    __table_args__ = (UniqueConstraint("campaign_id", "version"),)

    def __repr__(self) -> str:
        return f"<CampaignVersion campaign={self.campaign_id} v{self.version}>"
