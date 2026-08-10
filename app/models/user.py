from beanie import Document,Indexed
from pydantic import Field,BaseModel,EmailStr
from datetime import datetime,timezone


class User(Document):
    email: Indexed[EmailStr] = Indexed(unique=True)
    hashed_password: str
    is_active: bool = True
    created_at: datetime = Field(
        default_factory = datetime.now(timezone.utc)
    )
    class settings:
        name = "users"


class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    is_active: bool

class Token(BaseModel):
    access_token: str
    token_type: str = 'bearer'

class TokenData(BaseModel):
    user_id: str | None = None                

