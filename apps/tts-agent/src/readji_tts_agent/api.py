from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode

import httpx


class ApiError(RuntimeError):
    pass


class ApiUnauthorizedError(ApiError):
    """The current access token is no longer accepted by the API."""


@dataclass
class ApiClient:
    base_url: str
    access_token: str | None = None
    _http: httpx.Client | None = field(default=None, init=False, repr=False)

    def __enter__(self):
        self._http = httpx.Client(timeout=30, limits=httpx.Limits(
            max_connections=4, max_keepalive_connections=4, keepalive_expiry=60,
        ))
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        if self._http is not None:
            self._http.close()
            self._http = None

    def _url(self, path: str) -> str:
        return f"{self.base_url.rstrip('/')}{path}"

    def _request(self, method: str, path: str, *, json: dict[str, Any] | None = None) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.access_token}"} if self.access_token else {}
        request = self._http.request if self._http is not None else httpx.request
        response = request(method, self._url(path), json=json, headers=headers, timeout=30)
        if response.is_error:
            try:
                message = response.json().get("message")
            except ValueError:
                message = None
            if response.status_code == 401:
                raise ApiUnauthorizedError(message or "กรุณาเข้าสู่ระบบ")
            raise ApiError(message or f"API returned HTTP {response.status_code}")
        return response.json()

    def login(self, email: str, password: str, device_name: str) -> dict[str, Any]:
        result = self._request("POST", "/auth/agent/login", json={
            "email": email, "password": password, "device_name": device_name,
        })
        self.access_token = result["access_token"]
        return result

    def refresh(self, refresh_token: str) -> dict[str, Any]:
        result = self._request("POST", "/auth/agent/refresh", json={"refresh_token": refresh_token})
        self.access_token = result["access_token"]
        return result

    def list_stories(self) -> list[dict[str, Any]]:
        return self._request("GET", "/writer/tts/stories")["items"]

    def list_chapters(self, story_id: str, audio_status: str = "all", sort_by: str = "chapter_asc", page: int = 1, limit: int = 20) -> dict[str, Any]:
        query = urlencode({"story_id": story_id, "audio_status": audio_status, "sort_by": sort_by, "page": page, "limit": limit})
        return self._request("GET", f"/writer/tts/chapters?{query}")

    def cancel_all_jobs(self) -> dict[str, Any]:
        return self._request("POST", "/writer/tts/jobs/cancel-all")

    def job_status(self, job_id: str) -> str:
        return self._request("GET", f"/writer/tts/jobs/{job_id}")["status"]

    def queue_job(self, chapter_id: str, voice_slot: str) -> dict[str, Any]:
        return self._request("POST", "/writer/tts/jobs", json={"chapter_id": chapter_id, "voice_slot": voice_slot})

    def claim_job(self, worker_id: str) -> dict[str, Any] | None:
        return self._request("POST", f"/writer/tts/jobs/claim/{worker_id}")["job"]

    def update_progress(self, job_id: str, worker_id: str, completed: int, total: int) -> None:
        self._request("PATCH", f"/writer/tts/jobs/{job_id}/progress", json={
            "worker_id": worker_id, "completed_blocks": completed, "total_blocks": total,
        })

    def upload_url(self, job_id: str, worker_id: str) -> dict[str, Any]:
        return self._request("POST", f"/writer/tts/jobs/{job_id}/upload-url", json={"worker_id": worker_id})

    def complete_job(self, job_id: str, worker_id: str, duration_seconds: float, audio_timeline: list[dict[str, Any]]) -> None:
        self._request("POST", f"/writer/tts/jobs/{job_id}/complete", json={
            "worker_id": worker_id, "duration_seconds": duration_seconds, "audio_timeline": audio_timeline,
        })

    def fail_job(self, job_id: str, worker_id: str, message: str) -> None:
        self._request("POST", f"/writer/tts/jobs/{job_id}/fail", json={
            "worker_id": worker_id, "error_message": message[:2000],
        })

    def cancel_job(self, job_id: str, worker_id: str) -> None:
        self._request("POST", f"/writer/tts/jobs/{job_id}/cancel", json={"worker_id": worker_id})
