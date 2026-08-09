from pymongo import AsyncMongoClient
from beanie import init_beanie
from app.core.config import settings
from app.models.metric import Metrics


async def init_db():
    client = AsyncMongoClient(settings.MONGODB_URI)

    await init_beanie(
        database=client[settings.MONGO_DB],
        document_models=[Metrics]
    )