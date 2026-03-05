from fastapi import APIRouter

router = APIRouter(tags=["bets"])


@router.get("/bets")
def list_bets():
    return {"bets": [], "message": "Bet tracker endpoints - coming after model validation"}
