from __future__ import annotations

import json

import keyring

SERVICE_NAME = "Readji TTS Agent"
ACCOUNT_NAME = "refresh-token"


class CredentialStoreError(RuntimeError):
    """Raised when Windows Credential Manager cannot store a credential."""


def _load_password(account: str) -> str | None:
    try:
        return keyring.get_password(SERVICE_NAME, account)
    except keyring.errors.KeyringError:
        # A missing or unavailable OS credential backend must not stop audio
        # rendering. Treat it as an unavailable saved session instead.
        return None


def _save_password(account: str, value: str) -> None:
    try:
        keyring.set_password(SERVICE_NAME, account, value)
    except keyring.errors.KeyringError as error:
        raise CredentialStoreError("Windows Credential Manager is unavailable") from error


def _clear_password(account: str) -> None:
    try:
        keyring.delete_password(SERVICE_NAME, account)
    except (keyring.errors.KeyringError, keyring.errors.PasswordDeleteError):
        pass


def load_refresh_token() -> str | None:
    return _load_password(ACCOUNT_NAME)


def save_refresh_token(token: str) -> None:
    _save_password(ACCOUNT_NAME, token)


def clear_refresh_token() -> None:
    _clear_password(ACCOUNT_NAME)


def load_login_credentials(api_url: str) -> tuple[str, str] | None:
    saved = _load_password(f"login:{api_url.rstrip('/')}")
    if saved is None:
        return None
    credentials = json.loads(saved)
    if not isinstance(credentials, dict):
        raise ValueError("Invalid saved login credentials")
    email, password = credentials.get("email"), credentials.get("password")
    if not isinstance(email, str) or not isinstance(password, str) or not email or not password:
        raise ValueError("Invalid saved login credentials")
    return email, password


def save_login_credentials(api_url: str, email: str, password: str) -> None:
    _save_password(
        f"login:{api_url.rstrip('/')}",
        json.dumps({"email": email, "password": password}),
    )


def clear_login_credentials(api_url: str) -> None:
    account = f"login:{api_url.rstrip('/')}"
    if _load_password(account) is not None:
        _clear_password(account)
