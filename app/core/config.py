from pydantic import Field, field_validator
from pydantic_settings import BaseSettings , SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Lectio"
    APP_ENV: str = "development"

    @field_validator("APP_ENV")
    @classmethod
    def _normalise_env(cls, value: str) -> str:
        # The startup check already accepted "Production"; code elsewhere
        # compares with == "production", so store one spelling.
        return value.strip().lower()

    MONGODB_URI: str
    MONGO_DB: str 
    FRONTEND_URL: str = "http://localhost:5173"

    @field_validator("FRONTEND_URL")
    @classmethod
    def _no_trailing_slash(cls, value: str) -> str:
        # Browsers send the site's origin without a trailing slash, and the API
        # compares it letter for letter (CORS); links also append "/path".
        return value.strip().rstrip("/")

    # JWT settings
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Google OAuth
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GOOGLE_REDIRECT_URI: str | None = None

    # Email through SendLiberty (https://sendliberty.com)
    SENDLIBERTY_API_KEY: str | None = None
    EMAIL_FROM: str | None = None  # e.g. "Lectio <yourproduct@gmail.com>", an account connected in SendLiberty

    # Optional URL that receives a POST for every threshold-breach alert
    ALERT_WEBHOOK_URL: str | None = None

    # Alert emails: sent to the device owner when a new alert is raised
    ALERT_EMAILS_ENABLED: bool = True
    ALERT_EMAIL_MIN_SEVERITY: str = "WARNING"  # INFO, WARNING or CRITICAL
    ALERT_EMAIL_COOLDOWN_MINUTES: int = 30  # at most one email per device and rule in this time

    # Every raw reading is kept this long, then deleted by MongoDB (TTL index on
    # telemetry_snapshots.timestamp). Longer graphs read the hourly and daily
    # summaries (telemetry_rollups), kept for the two periods after it.
    TELEMETRY_RETENTION_DAYS: int = Field(default=7, ge=1)
    ROLLUP_HOURLY_RETENTION_DAYS: int = Field(default=90, ge=1)
    ROLLUP_DAILY_RETENTION_DAYS: int = Field(default=730, ge=1)

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_MINUTE: int = 60  # per signed-in user (or per IP without a token)
    RATE_LIMIT_AUTH_PER_MINUTE: int = 10  # per IP: login, register, password reset, email verification
    RATE_LIMIT_INGEST_PER_MINUTE: int = 120  # per device key: agent telemetry uploads
    RATE_LIMIT_FIX_PER_MINUTE: int = 10  # per user: asking a PC to run or undo a fix (on top of the general budget)

    # Alert thresholds live in app/core/anomaly_rules.py (see docs/alert-thresholds.md).

    # Anomaly Engine Settings
    ANOMALY_ENGINE_ENABLED: bool = True
    ANOMALY_ENGINE_DEBOUNCE_ENABLED: bool = True
    ANOMALY_ENGINE_AUTO_RESOLUTION: bool = True
    # An open alert closes by itself when its reading hasn't been reported for
    # this long (for example a sensor that stopped answering).
    ALERT_STALE_MINUTES: int = 15

    # The Windows agent handed out at /api/v1/agent/download. agent/build_exe.py
    # copies each new build here; replace the file to publish a new version.
    AGENT_DOWNLOAD_PATH: str = "downloads/lectio-agent.exe"

    # AI (Google Gemini) for diagnosis reports and fix advice. Reached through
    # Gemini's OpenAI-compatible endpoint, so the openai package is the client.
    # Without a key, both features use Lectio's built-in rules.
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash"
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    GEMINI_TIMEOUT_SECONDS: float = 30.0
    # Fix options are shown while someone waits, so Gemini gets less time there;
    # past it, the built-in order is used straight away.
    GEMINI_FIX_TIMEOUT_SECONDS: float = 10.0

    # --- Database connection pool (one client per API process, shared by all requests)
    MONGO_MAX_POOL_SIZE: int = Field(default=50, ge=1)  # connections this process may open
    MONGO_MIN_POOL_SIZE: int = Field(default=2, ge=0)  # kept open while idle (opening one is slow)
    MONGO_MAX_IDLE_TIME_MS: int = 300_000  # close connections idle this long
    MONGO_CONNECT_TIMEOUT_MS: int = 10_000
    MONGO_SERVER_SELECTION_TIMEOUT_MS: int = 15_000  # how long to wait for a usable server
    MONGO_SOCKET_TIMEOUT_MS: int = 120_000  # one operation's network wait; generous for slow links
    MONGO_WAIT_QUEUE_TIMEOUT_MS: int = 10_000  # how long a request waits for a free connection
    # Attempts to reach the database at startup, 1, 2, 4... up to 30 s apart:
    # 10 rides out a Wi-Fi drop of about two and a half minutes.
    MONGO_STARTUP_RETRIES: int = Field(default=10, ge=1)
    SLOW_QUERY_MS: int = 500  # database commands slower than this are logged

    # --- Cache. With REDIS_URL set, Redis (shared by every API process);
    # otherwise an in-memory cache in this process.
    REDIS_URL: str | None = None
    CACHE_USER_TTL_SECONDS: int = 30
    CACHE_DEVICE_TTL_SECONDS: int = 60
    CACHE_LATEST_READING_TTL_SECONDS: int = 600

    # --- Telemetry ingestion: readings are stored on arrival; alert checks and
    # live relay run in background workers fed from a bounded queue.
    INGEST_BATCH_MAX: int = Field(default=100, ge=1, le=1000)
    INGEST_QUEUE_SIZE: int = Field(default=10_000, ge=1)
    INGEST_WORKERS: int = Field(default=2, ge=1)

    model_config =  SettingsConfigDict(env_file=".env",extra="ignore")


settings = Settings()       
