from pydantic_settings import BaseSettings , SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Lectio"
    APP_ENV: str = "development"
    MONGODB_URI: str 
    MONGO_DB: str 
    FRONTEND_URL: str = "http://localhost:5173"

    # JWT settings
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Google OAuth
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GOOGLE_REDIRECT_URI: str | None = None

    # SMTP settings
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_EMAIL: str | None = None
    SMTP_USE_TLS: bool = True

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_MINUTE: int = 60

    # Anomaly Detection Thresholds
    # CPU Thermal Thresholds
    CPU_TEMP_CRITICAL_THRESHOLD: float = 90.0
    CPU_TEMP_WARNING_THRESHOLD: float = 80.0
    CPU_PACKAGE_TEMP_CRITICAL_THRESHOLD: float = 95.0
    CPU_TEMP_DURATION_THRESHOLD: float = 30.0  # seconds
    CPU_TEMP_RESOLUTION_DURATION: float = 15.0  # seconds

    # GPU Thermal Thresholds
    GPU_HOTSPOT_CRITICAL_THRESHOLD: float = 95.0
    GPU_CORE_WARNING_THRESHOLD: float = 85.0
    GPU_HOTSPOT_DURATION_THRESHOLD: float = 15.0  # seconds
    GPU_CORE_DURATION_THRESHOLD: float = 30.0  # seconds
    GPU_RESOLUTION_DURATION: float = 15.0  # seconds

    # PSU Voltage Thresholds (±5% tolerance)
    PSU_12V_UNDERVOLTAGE_THRESHOLD: float = 11.4
    PSU_12V_OVERVOLTAGE_THRESHOLD: float = 12.6
    PSU_VOLTAGE_DURATION_THRESHOLD: float = 5.0  # seconds
    PSU_VOLTAGE_RESOLUTION_DURATION: float = 10.0  # seconds

    # NVMe Health Thresholds
    NVME_HEALTH_WARNING_THRESHOLD: float = 20.0
    NVME_HEALTH_CRITICAL_THRESHOLD: float = 10.0
    NVME_HEALTH_DURATION_THRESHOLD: float = 60.0  # seconds
    NVME_HEALTH_RESOLUTION_DURATION: float = 300.0  # seconds

    # WHEA Error Thresholds
    WHEA_ERROR_THRESHOLD: float = 1.0
    WHEA_ERROR_DURATION_THRESHOLD: float = 60.0  # seconds
    WHEA_ERROR_RESOLUTION_DURATION: float = 300.0  # seconds

    # VRM Thermal Thresholds
    VRM_TEMP_CRITICAL_THRESHOLD: float = 100.0
    VRM_TEMP_WARNING_THRESHOLD: float = 85.0
    VRM_TEMP_DURATION_THRESHOLD: float = 30.0  # seconds
    VRM_TEMP_RESOLUTION_DURATION: float = 15.0  # seconds

    # Utilization Thresholds (Info level)
    UTILIZATION_HIGH_THRESHOLD: float = 90.0
    UTILIZATION_DURATION_THRESHOLD: float = 60.0  # seconds
    UTILIZATION_RESOLUTION_DURATION: float = 30.0  # seconds

    # Anomaly Engine Settings
    ANOMALY_ENGINE_ENABLED: bool = True
    ANOMALY_ENGINE_DEBOUNCE_ENABLED: bool = True
    ANOMALY_ENGINE_AUTO_RESOLUTION: bool = True

    # AI Diagnostic Settings
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_TIMEOUT_SECONDS: float = 5.0

    model_config =  SettingsConfigDict(env_file=".env",extra="ignore")


settings = Settings()       
