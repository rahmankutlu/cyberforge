"""AI provider abstraction.

Three adapters, one method: `complete(system, user) -> str`. Adapters send text only. They never
declare tools or functions to the model, so a model response can never trigger an action; the
analyst feature only ever displays text.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from urllib.parse import urlparse

import httpx

from cyberforge.config import Settings


class ProviderError(RuntimeError):
    """Raised for any provider failure; the message is safe to show to the user."""


class AIProvider(ABC):
    name: str

    def __init__(self, model: str, base_url: str, api_key: str | None, timeout: float):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    @abstractmethod
    def complete(self, system: str, user: str) -> str: ...

    def _post(self, url: str, payload: dict, headers: dict[str, str]) -> dict:
        try:
            resp = httpx.post(url, json=payload, headers=headers, timeout=self.timeout)
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Could not reach the {self.name} endpoint: {type(exc).__name__}"
            ) from exc
        if resp.status_code >= 400:
            raise ProviderError(f"{self.name} returned HTTP {resp.status_code}")
        try:
            return resp.json()
        except ValueError as exc:
            raise ProviderError(f"{self.name} returned a non-JSON response") from exc


class OpenAICompatibleProvider(AIProvider):
    """Any server that implements POST /chat/completions (OpenAI, vLLM, LM Studio, gateways)."""

    name = "openai"

    def complete(self, system: str, user: str) -> str:
        data = self._post(
            f"{self.base_url}/chat/completions",
            {
                "model": self.model,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {},
        )
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError(
                "Unexpected response shape from the OpenAI-compatible endpoint"
            ) from exc


class GeminiProvider(AIProvider):
    name = "gemini"

    def complete(self, system: str, user: str) -> str:
        data = self._post(
            f"{self.base_url}/models/{self.model}:generateContent",
            {
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}],
                "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
            },
            {"x-goog-api-key": self.api_key or ""},
        )
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("Unexpected response shape from Gemini") from exc


class OllamaProvider(AIProvider):
    """Local models via Ollama. Nothing leaves the machine."""

    name = "ollama"

    def complete(self, system: str, user: str) -> str:
        data = self._post(
            f"{self.base_url}/api/chat",
            {
                "model": self.model,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.2},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            {},
        )
        try:
            return data["message"]["content"]
        except (KeyError, TypeError) as exc:
            raise ProviderError("Unexpected response shape from Ollama") from exc


DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
    "ollama": "http://host.docker.internal:11434",
}


def provider_status(settings: Settings) -> tuple[AIProvider | None, str | None]:
    """Return (provider, None) when usable, or (None, human-readable reason)."""
    kind = settings.ai_provider
    if kind == "none":
        return (
            None,
            "AI analysis is not configured. Set CYBERFORGE_AI_PROVIDER to enable it (optional).",
        )
    if not settings.ai_model:
        return None, "CYBERFORGE_AI_MODEL is not set."
    base = settings.ai_base_url or DEFAULT_BASE_URLS[kind]
    parsed = urlparse(base)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None, "CYBERFORGE_AI_BASE_URL must be an http(s) URL."
    key = settings.ai_api_key.get_secret_value() if settings.ai_api_key else None
    if kind in ("openai", "gemini") and not key and not settings.ai_base_url:
        return None, f"CYBERFORGE_AI_API_KEY is required for the {kind} provider."
    args = (settings.ai_model, base, key, settings.ai_timeout_seconds)
    if kind == "openai":
        return OpenAICompatibleProvider(*args), None
    if kind == "gemini":
        return GeminiProvider(*args), None
    return OllamaProvider(*args), None
