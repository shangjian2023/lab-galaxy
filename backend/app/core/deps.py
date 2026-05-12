import uuid

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.models import User

bearer_scheme = HTTPBearer()


async def _get_user_from_token(token_value: str, db: AsyncSession) -> User:
    try:
        payload = decode_access_token(token_value)
        user_id = uuid.UUID(payload["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的认证凭据")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已禁用")
    return user


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Decode JWT and return the current user row."""
    return await _get_user_from_token(creds.credentials, db)


async def get_current_user_from_header_or_query(
    db: AsyncSession = Depends(get_db),
    token: str | None = Query(None),
    creds: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False)),
) -> User:
    """Decode JWT from Bearer header or query parameter `token`."""
    token_value = token or (creds.credentials if creds else None)
    if not token_value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的认证凭据")
    return await _get_user_from_token(token_value, db)


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency that only allows admin users."""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return current_user
