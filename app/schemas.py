from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class UserOut(BaseModel):
    id: int
    email: str
    role: str
    created_at: datetime
    model_config = {"from_attributes": True}

class GrantIn(BaseModel):
    email: EmailStr

class GrantOut(BaseModel):
    user_id: int
    email: str
    active: bool
    created_at: datetime
