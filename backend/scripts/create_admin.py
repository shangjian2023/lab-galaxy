"""Create an initial admin user.

Usage:
    cd backend
    python -m scripts.create_admin --username admin --email admin@example.com --password admin123
"""

import argparse
import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.core.security import hash_password
from app.models.models import User


async def create_admin(username: str, email: str, password: str):
    async with async_session() as db:
        existing = (
            await db.execute(select(User).where(User.username == username))
        ).scalar_one_or_none()
        if existing:
            print(f"User '{username}' already exists (role={existing.role})")
            if existing.role != "admin":
                existing.role = "admin"
                await db.commit()
                print(f"  -> Upgraded to admin")
            return

        user = User(
            username=username,
            email=email,
            hashed_password=hash_password(password),
            role="admin",
            nickname="管理员",
        )
        db.add(user)
        await db.commit()
        print(f"Admin user created: {username} ({email})")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", default="admin")
    parser.add_argument("--email", default="admin@example.com")
    parser.add_argument("--password", default="admin123")
    args = parser.parse_args()

    asyncio.run(create_admin(args.username, args.email, args.password))


if __name__ == "__main__":
    main()
