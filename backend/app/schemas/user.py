import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ---------- Auth ----------

class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- User profile ----------

class UserProfile(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    nickname: str | None = None
    avatar: str | None = None
    role: str = "user"
    level: int = 1
    points: int = 0
    is_active: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    nickname: str | None = None
    avatar: str | None = None


# ---------- Admin schemas ----------

class AdminUserUpdate(BaseModel):
    nickname: str | None = None
    avatar: str | None = None
    role: str | None = Field(None, pattern="^(admin|user)$")
    level: int | None = Field(None, ge=1)
    is_active: bool | None = None


class AdminUserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    nickname: str | None = None
    role: str = Field("user", pattern="^(admin|user)$")


class AdminPointsAdjust(BaseModel):
    change: int
    reason: str = Field(max_length=255)
