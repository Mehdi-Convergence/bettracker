from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse

from src.api.health import router as health_router
from src.api.matches import router as matches_router
from src.api.backtest import router as backtest_router
from src.api.scanner import router as scanner_router
from src.api.combos import router as combos_router
from src.api.portfolio import router as portfolio_router
from src.api.campaigns import router as campaigns_router
from src.api.auth import router as auth_router
from src.api.dashboard import router as dashboard_router
from src.api.settings import router as settings_router
from src.api.notifications import router as notifications_router
from src.api.feedback import router as feedback_router
from src.api.stripe_router import router as stripe_router
from src.api.ai_analyste import router as ai_router
from src.api.admin import router as admin_router

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
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    for k, v in SECURITY_HEADERS.items():
        response.headers[k] = v
    return response


app.include_router(health_router)
app.include_router(auth_router, prefix="/api")
app.include_router(matches_router, prefix="/api")
app.include_router(backtest_router, prefix="/api")
app.include_router(scanner_router, prefix="/api")
app.include_router(combos_router, prefix="/api")
app.include_router(portfolio_router, prefix="/api")
app.include_router(campaigns_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")
app.include_router(stripe_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
