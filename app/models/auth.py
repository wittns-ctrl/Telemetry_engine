from pydantic import BaseModel,Field,EmailStr

class forgot_passwordRequest(BaseModel):
    email: EmailStr

class ResetPassword(BaseModel):
    token : str
    password : str = Field(...,min_length=8,description = "password must contain al least 8 characters")   