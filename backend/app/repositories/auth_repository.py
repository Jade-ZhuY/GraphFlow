from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.auth import AuthSessionModel, UserModel


class AuthRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_user_by_id(self, user_id: str) -> UserModel | None:
        return self.db.get(UserModel, user_id)

    def get_user_by_email(self, email: str) -> UserModel | None:
        statement = select(UserModel).where(UserModel.email == email.lower())
        return self.db.scalar(statement)

    def get_user_by_username(self, username: str) -> UserModel | None:
        statement = select(UserModel).where(
            func.lower(UserModel.username) == username.lower()
        )
        return self.db.scalar(statement)

    def add_user(self, user: UserModel) -> None:
        self.db.add(user)

    def get_session_by_id(self, session_id: str) -> AuthSessionModel | None:
        return self.db.get(AuthSessionModel, session_id)

    def get_session_by_refresh_hash(
        self,
        refresh_token_hash: str,
    ) -> AuthSessionModel | None:
        statement = select(AuthSessionModel).where(
            AuthSessionModel.refresh_token_hash == refresh_token_hash
        )
        return self.db.scalar(statement)

    def add_session(self, session: AuthSessionModel) -> None:
        self.db.add(session)

    def commit(self) -> None:
        self.db.commit()

    def refresh(self, instance: object) -> None:
        self.db.refresh(instance)

    def revoke_session(self, session: AuthSessionModel, revoked_at: datetime) -> None:
        session.revoked_at = revoked_at
