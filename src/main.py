from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse

from src.api.health import router as health_router
from src.api.matches import router as matches_router
from src.api.bets import router as bets_router
from src.api.predictions import router as predictions_router
from src.api.backtest import router as backtest_router
from src.api.scanner import router as scanner_router
from src.api.combos import router as combos_router
from src.api.portfolio import router as portfolio_router
from src.api.campaigns import router as campaigns_router
from src.api.auth import router as auth_router

from src.config import settings
from src.rate_limit import limiter

app = FastAPI(
    title="BetTracker",
    description="Value bet detection algorithm for European football",
    version="0.2.0",
)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": "Trop de requêtes. Réessayez plus tard."})


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router, prefix="/api")
app.include_router(matches_router, prefix="/api")
app.include_router(bets_router, prefix="/api")
app.include_router(predictions_router, prefix="/api")
app.include_router(backtest_router, prefix="/api")
app.include_router(scanner_router, prefix="/api")
app.include_router(combos_router, prefix="/api")
app.include_router(portfolio_router, prefix="/api")
app.include_router(campaigns_router, prefix="/api")
