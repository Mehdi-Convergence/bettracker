from fastapi import APIRouter

router = APIRouter(tags=["predictions"])


@router.get("/predictions")
def list_predictions():
    return {"predictions": [], "message": "Prediction endpoints - coming after model training"}
