from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    PAGE_DIR: str = "pages"
    STATIC_DIR: str = "static"
    model_config = SettingsConfigDict(
        env_file=".env", case_sensitive=True, validate_default=True
    )


config = Config()
