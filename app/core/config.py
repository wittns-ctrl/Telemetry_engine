from pydantic_settings import BaseSettings , SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str
    MONGODB_URI: str 
    MONGO_DB: str 

    #jwt settings

    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int

    model_config =  SettingsConfigDict(env_file=".env",extra="ignore")


settings = Settings()       
