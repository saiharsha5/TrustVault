import os
os.environ["DATABASE_URL"] = "sqlite:////tmp/test_trustvault.db"
os.environ["STORAGE_DIR"] = "/tmp/test_private_storage"
os.environ["SESSION_SECRET"] = "test-secret-that-is-long-enough-123456"
os.environ["BOOTSTRAP_DEMO"] = "false"

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine

@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)
