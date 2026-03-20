"""
Shared Gemini API client helpers.
"""

import json
import os
import re
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = "gemini-2.5-flash-lite"
API_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

load_dotenv(PROJECT_ROOT / ".env")


class GeminiAPIError(RuntimeError):
    """Raised when the Gemini API call fails."""


def get_api_key() -> str:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise GeminiAPIError(
            "GEMINI_API_KEY environment variable not set. "
            "Create one in Google AI Studio and add it to your .env file."
        )
    return api_key


def get_model_name() -> str:
    return os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)


def generate_text(
    prompt: str,
    max_tokens: int = 1500,
    temperature: float = 0.2,
    model: str | None = None,
) -> str:
    return _generate_content(
        prompt=prompt,
        max_tokens=max_tokens,
        temperature=temperature,
        model=model,
    )


def generate_json(
    prompt: str,
    max_tokens: int = 1500,
    temperature: float = 0.1,
    model: str | None = None,
    schema: dict[str, Any] | None = None,
) -> dict[str, Any]:
    raw = _generate_content(
        prompt=prompt,
        max_tokens=max_tokens,
        temperature=temperature,
        model=model,
        response_mime_type="application/json",
        response_json_schema=schema,
    )
    raw = strip_markdown_fences(raw)
    return json.loads(raw)


def _generate_content(
    prompt: str,
    max_tokens: int,
    temperature: float,
    model: str | None,
    response_mime_type: str | None = None,
    response_json_schema: dict[str, Any] | None = None,
) -> str:
    payload: dict[str, Any] = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": temperature,
        },
    }

    if response_mime_type:
        payload["generationConfig"]["responseMimeType"] = response_mime_type
    if response_json_schema:
        payload["generationConfig"]["responseJsonSchema"] = response_json_schema

    response = requests.post(
        API_URL_TEMPLATE.format(model=model or get_model_name()),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": get_api_key(),
        },
        json=payload,
        timeout=90,
    )

    if response.status_code >= 400:
        try:
            error_message = response.json().get("error", {}).get("message", response.text)
        except ValueError:
            error_message = response.text
        raise GeminiAPIError(f"Gemini API request failed: {error_message}")

    data = response.json()
    candidates = data.get("candidates", [])
    if not candidates:
        feedback = data.get("promptFeedback", {})
        block_reason = feedback.get("blockReason")
        if block_reason:
            raise GeminiAPIError(f"Gemini returned no candidate. Block reason: {block_reason}")
        raise GeminiAPIError("Gemini returned no candidate content.")

    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(part.get("text", "") for part in parts if part.get("text")).strip()
    if not text:
        finish_reason = candidates[0].get("finishReason", "unknown")
        raise GeminiAPIError(f"Gemini returned an empty response. Finish reason: {finish_reason}")

    return text


def strip_markdown_fences(raw: str) -> str:
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()
