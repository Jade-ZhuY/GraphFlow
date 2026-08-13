import re
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.base import Base


def _connect_args(database_url: str) -> dict[str, bool]:
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


def _ensure_sqlite_parent(database_url: str) -> None:
    if not database_url.startswith("sqlite:///"):
        return
    path = database_url.removeprefix("sqlite:///")
    if path == ":memory:":
        return
    Path(path).parent.mkdir(parents=True, exist_ok=True)


def _quote_mysql_identifier(identifier: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_]+", identifier):
        raise ValueError(f"Unsafe MySQL identifier: {identifier}")
    return f"`{identifier}`"


def _ensure_mysql_database(database_url: str) -> None:
    url = make_url(database_url)
    if not url.drivername.startswith("mysql") or not url.database:
        return

    database_name = url.database
    server_url = url.set(database="")
    server_engine = create_engine(server_url)
    quoted_database = _quote_mysql_identifier(database_name)
    with server_engine.begin() as connection:
        connection.execute(
            text(
                "CREATE DATABASE IF NOT EXISTS "
                f"{quoted_database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        )
    server_engine.dispose()


_ensure_sqlite_parent(settings.database_url)
_ensure_mysql_database(settings.database_url)

engine: Engine = create_engine(
    settings.database_url,
    connect_args=_connect_args(settings.database_url),
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,
)


def init_db() -> None:
    from app.models import (
        auth,  # noqa: F401
        conversation,  # noqa: F401
        graph,  # noqa: F401
    )

    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
