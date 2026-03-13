from datetime import date
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.base import Base, TimestampMixin


class PMURace(Base, TimestampMixin):
    __tablename__ = "pmu_races"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Identifiant unique PMU (ex: "2026-03-13-R1-C1")
    race_id: Mapped[str] = mapped_column(String(60), unique=True)

    race_date: Mapped[date]
    race_time: Mapped[Optional[str]] = mapped_column(String(10))  # ex: "14h30"
    hippodrome: Mapped[str] = mapped_column(String(100))
    race_number: Mapped[int]  # R1, R2, ...
    race_type: Mapped[str] = mapped_column(String(30))  # plat, trot_attele, ...
    distance: Mapped[int]  # metres
    terrain: Mapped[Optional[str]] = mapped_column(String(30))  # bon, souple, ...
    prize_pool: Mapped[Optional[float]]  # dotation en euros
    num_runners: Mapped[Optional[int]]
    is_quinteplus: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relation one-to-many
    runners: Mapped[list["PMURunner"]] = relationship(
        "PMURunner",
        back_populates="race",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_pmu_race_date", "race_date"),
        Index("idx_pmu_hippodrome", "hippodrome"),
        Index("idx_pmu_race_type", "race_type"),
    )

    def __repr__(self) -> str:
        return (
            f"<PMURace {self.hippodrome} R{self.race_number} "
            f"({self.race_date}) {self.race_type}>"
        )


class PMURunner(Base, TimestampMixin):
    __tablename__ = "pmu_runners"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Foreign key vers pmu_races
    race_id: Mapped[int] = mapped_column(ForeignKey("pmu_races.id"), nullable=False)

    number: Mapped[int]  # numero de dossard
    horse_name: Mapped[str] = mapped_column(String(100))
    jockey_name: Mapped[Optional[str]] = mapped_column(String(100))
    trainer_name: Mapped[Optional[str]] = mapped_column(String(100))
    age: Mapped[Optional[int]]
    weight: Mapped[Optional[float]]  # kg
    odds_final: Mapped[Optional[float]]  # cote PMU finale
    odds_morning: Mapped[Optional[float]]  # cote du matin
    finish_position: Mapped[Optional[int]]  # null si pas encore couru
    is_scratched: Mapped[bool] = mapped_column(Boolean, default=False)
    form_string: Mapped[Optional[str]] = mapped_column(String(30))  # ex: "1a3p2p"
    last_5_positions: Mapped[Optional[str]] = mapped_column(String(50))  # JSON "[1,3,2,5,4]"

    # Relation inverse
    race: Mapped["PMURace"] = relationship("PMURace", back_populates="runners")

    __table_args__ = (
        Index("idx_pmu_runner_race", "race_id"),
        Index("idx_pmu_horse_name", "horse_name"),
    )

    def __repr__(self) -> str:
        return f"<PMURunner #{self.number} {self.horse_name}>"
