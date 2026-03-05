from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.health import router as health_router
from src.api.matches import router as matches_router
from src.api.bets import router as bets_router
from src.api.predictions import router as predictions_router
from src.api.backtest import router as backtest_router
from src.api.scanner import router as scanner_router
from src.api.combos import router as combos_router
from src.api.portfolio import router as portfolio_router
from src.api.campaigns import router as campaigns_router

app = FastAPI(
    title="BetTracker",
    description="Value bet detection algorithm for European football",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(matches_router, prefix="/api")
app.include_router(bets_router, prefix="/api")
app.include_router(predictions_router, prefix="/api")
app.include_router(backtest_router, prefix="/api")
app.include_router(scanner_router, prefix="/api")
app.include_router(combos_router, prefix="/api")
app.include_router(portfolio_router, prefix="/api")
app.include_router(campaigns_router, prefix="/api")
