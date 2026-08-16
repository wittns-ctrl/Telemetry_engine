from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from beanie import PydanticObjectId
from app.core.config import settings
from app.core.security import verify_password
from app.models.user import User, TokenData

# OAth2 setup: instructs Swagger UI to get bearer tokens from /api/v1/auth/login

oauth2_scheme = OAuth2PasswordBearer(tokenUrl ="/api/v1/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code = status.HTTP_401_UNAUTHORIZED,
        detail = "could not validate credentials",
        headers={"WWW-Authenticate":"Bearer"},
    )
    try:
        # Decode token
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(user_id = user_id)
    except jwt.InvalidTokenError:
        raise credentials_exception


    #Query user from MongoDB by PydanticObjectId
    user = await User.get(PydanticObjectId(token_data.user_id))

    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400,detail = "Inactive user")

    return user    