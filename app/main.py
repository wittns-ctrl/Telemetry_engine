from contextlib import asynccontextmanager
from datetime import timedelta
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from app.core.config import settings
from app.core.security import get_password_hash, verify_password, create_access_token
from app.db.session import init_db
from app.models.metric import Metrics
from app.models.user import User, UserCreate, UserResponse, Token
from app.api.deps import get_current_user

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="Telemetry Engine", lifespan=lifespan)

# --- AUTH ROUTES ---

@app.post("/api/v1/auth/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(user_in: UserCreate):
    # Check if user exists
    existing_user = await User.find_one(User.email == user_in.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists."
        )
    
    # Save user with hashed password
    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password)
    )
    await user.insert()
    return UserResponse(id=str(user.id), email=user.email, is_active=user.is_active)

@app.post("/api/v1/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # OAuth2PasswordRequestForm uses form_data.username for the identifier (we pass email)
    user = await User.find_one(User.email == form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer")

@app.get("/api/v1/users/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(id=str(current_user.id), email=current_user.email, is_active=current_user.is_active)

# --- PROTECTED METRICS ROUTE ---

@app.post("/api/v1/metrics", status_code=status.HTTP_201_CREATED)
async def create_metric(
    payload: dict,
    current_user: User = Depends(get_current_user)  # Requires valid JWT
):
    metric = Metrics(**payload)
    await metric.insert()
    return metric