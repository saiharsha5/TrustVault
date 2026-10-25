from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "sqlite:///./trustvault.db"
    session_secret: str = "dev-only-change-this-secret-before-use-123456789"
    session_https_only: bool = False
    storage_dir: str = "./private_storage"
    max_upload_bytes: int = 10 * 1024 * 1024
    bootstrap_demo: bool = False
    bootstrap_admin_password: str = ""
    bootstrap_owner_password: str = ""
    bootstrap_viewer_password: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
