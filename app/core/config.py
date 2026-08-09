from pydantic_settings import BaseSettings , SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str
    MONGODB_URI: str 
    MONGO_DB: str 

    model_config =  SettingsConfigDict(env_file=".env",extra="ignore")


settings = Settings()       
