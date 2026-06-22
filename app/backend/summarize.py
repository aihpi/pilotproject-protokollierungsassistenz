"""
Summarization module for generating meeting minutes per TOP.

Uses Ollama for local German summarization.

Configuration via environment variables:
- LLM_BASE_URL: API endpoint (default: http://localhost:11434/v1 for Ollama)
- LLM_MODEL: Model name (default: qwen3:8b)

Setup Ollama:
    brew install ollama
    ollama serve
    ollama pull qwen3:8b

The server provides an OpenAI-compatible API at http://localhost:11434/v1
"""

import os
import time
from dataclasses import dataclass
from typing import Optional

from llm_config import load_prompt

# LLM server configuration (Ollama)
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen3:8b")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "ollama")


@dataclass
class SummarizationResult:
    """Result from summarization including timing."""

    summary: str
    duration_seconds: float


def summarize_segment(
    top_title: str,
    transcript_text: str,
    model: Optional[str] = None,
    system_prompt: Optional[str] = None,
) -> SummarizationResult:
    """
    Generate a summary for a meeting segment (TOP) using Ollama.

    Args:
        top_title: Title of the agenda item (TOP)
        transcript_text: Full transcript text for this TOP
        model: LLM model to use (default: from env or qwen3:8b)
        system_prompt: Custom system prompt (default: prompt_llama.txt)

    Returns:
        SummarizationResult with summary text and duration in seconds

    Requires Ollama running:
        ollama serve
        ollama pull <model>
    """
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError(
            "OpenAI client nicht installiert. Installieren Sie mit: uv add openai"
        )

    client = OpenAI(
        base_url=LLM_BASE_URL,
        api_key=LLM_API_KEY,
    )

    # Use provided values or fall back to defaults
    actual_model = model or LLM_MODEL
    actual_system_prompt = system_prompt or load_prompt("prompt_llama.txt")

    user_prompt = f"""Erstelle eine Zusammenfassung für folgenden Tagesordnungspunkt:

TOP: {top_title}

Transkript:
{transcript_text}

Zusammenfassung:"""

    start_time = time.time()
    response = client.chat.completions.create(
        model=actual_model,
        messages=[
            {"role": "system", "content": actual_system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=1024,
        temperature=0.3,  # Lower temperature for more consistent output
    )
    duration_seconds = time.time() - start_time

    summary = response.choices[0].message.content or ""
    return SummarizationResult(summary=summary, duration_seconds=duration_seconds)


def summarize_all_segments(
    tops: list[str],
    segments: dict[int, str],
) -> dict[int, str]:
    """
    Generate summaries for all TOPs.

    Args:
        tops: List of TOP titles
        segments: Dict mapping TOP index to transcript text

    Returns:
        Dict mapping TOP index to summary text
    """
    summaries = {}
    for top_idx, transcript_text in segments.items():
        if transcript_text.strip():
            top_title = tops[top_idx] if top_idx < len(tops) else f"TOP {top_idx + 1}"
            summaries[top_idx] = summarize_segment(top_title, transcript_text)
    return summaries
