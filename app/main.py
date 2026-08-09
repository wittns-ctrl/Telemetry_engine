from contextlib import asynccontextmanager
from fastapi import FastAPI,status
from app.models.metric import Metrics
from app.db.session import init_db
from pydantic import BaseModel


@asynccontextmanager
async def lifespan( app : FastAPI):
    await init_db()

    yield

app = FastAPI(title = "Telemetry engine", lifespan = lifespan)

class MetricCreate(BaseModel):
    sensor_id:str
    metric_type:str
    value: float


@app.post("/api/v1/metrics", status_code = status.HTTP_201_CREATED)
async def createMetric(payload : MetricCreate):

    metric = Metrics(**payload.model_dump())
    await metric.insert()
    return metric  


@app.get("/", status_code = status.HTTP_200_OK)
async def showMetric(limit: int = 10 ):
    
    return await Metrics.find_all().sort("-timestamp").limit(limit).to_list()
    