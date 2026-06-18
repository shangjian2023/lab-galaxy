from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(
    settings.POSTGRES_URL,
    echo=settings.DEBUG,
    pool_size=10,          # steady-state connections kept in the pool
    max_overflow=20,       # burst connections allowed beyond pool_size
    pool_recycle=3600,     # recycle connections every hour (avoids stale/TCP-keepalive issues)
    pool_pre_ping=True,    # test connections before use (detect server-side disconnects)
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session
