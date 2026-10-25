from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User
from app.security import read_session_token

COOKIE_NAME = "trustvault_session"

def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    user_id = read_session_token(token) if token else None

    if not user_id:
        auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            user_id = read_session_token(token) if token else None
        elif request.headers.get("X-Session-Token"):
            token = request.headers.get("X-Session-Token").strip()
            user_id = read_session_token(token) if token else None

    user = db.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user

def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator role required")
    return user
