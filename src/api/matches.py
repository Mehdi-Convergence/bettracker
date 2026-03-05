from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.database import get_db
from src.models.match import FootballMatch

router = APIRouter(tags=["matches"])


@router.get("/matches")
def list_matches(
    sport: str = "football",
    league: Optional[str] = None,
    season: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    query = db.query(FootballMatch)
    if league:
        query = query.filter(FootballMatch.league == league)
    if season:
        query = query.filter(FootballMatch.season == season)
    query = query.order_by(FootballMatch.date.desc())
    total = query.count()
    matches = query.offset(offset).limit(limit).all()
    return {"total": total, "matches": [_match_to_dict(m) for m in matches]}


@router.get("/teams/search", response_model=list[str])
def search_teams(
    q: str = Query(min_length=2, description="Search prefix"),
    limit: int = Query(default=15, le=50),
    db: Session = Depends(get_db),
):
    """Autocomplete team names from historical match data."""
    pattern = f"%{q}%"
    home = db.query(FootballMatch.home_team).filter(
        FootballMatch.home_team.ilike(pattern)
    ).distinct()
    away = db.query(FootballMatch.away_team).filter(
        FootballMatch.away_team.ilike(pattern)
    ).distinct()
    results = home.union(away).limit(limit).all()
    return sorted(set(r[0] for r in results))


@router.get("/matches/{match_id}")
def get_match(match_id: int, db: Session = Depends(get_db)):
    match = db.query(FootballMatch).filter(FootballMatch.id == match_id).first()
    if not match:
        return {"error": "Match not found"}
    return _match_to_dict(match)


def _match_to_dict(m: FootballMatch) -> dict:
    return {
        "id": m.id,
        "season": m.season,
        "league": m.league,
        "date": m.date.isoformat(),
        "home_team": m.home_team,
        "away_team": m.away_team,
        "fthg": m.fthg,
        "ftag": m.ftag,
        "ftr": m.ftr,
        "odds_home": m.odds_home,
        "odds_draw": m.odds_draw,
        "odds_away": m.odds_away,
    }
