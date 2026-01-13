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

# LLM server configuration (Ollama)
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen3:8b")


from typing import Optional

# Default system prompt for meeting summarization
DEFAULT_SYSTEM_PROMPT = """Du bist ein Experte für die Erstellung von Sitzungsprotokollen für deutsche Kommunalverwaltungen.

Deine Aufgabe ist es, aus einem Transkript eines Tagesordnungspunktes (TOP) eine Zusammenfassung im Stil einer offiziellen Niederschrift zu erstellen.

STIL:
- Formale Verwaltungssprache, dritte Person
- Beispiel: "Die Vorsitzende erläuterte den Sachverhalt.", "Herr Müller wies auf die Kostenfrage hin."
- Paraphrasieren statt wörtlich zitieren

INHALT:
- Wesentliche Diskussionspunkte und Argumente
- Getroffene Beschlüsse mit Abstimmungsergebnis (z.B. "einstimmig beschlossen", "mit 5:2 Stimmen angenommen")
- Wichtige Positionen der Teilnehmer
- Vereinbarte Maßnahmen oder nächste Schritte

IGNORIEREN:
- Verfahrensdetails (Mikrofon, Redezeit, Begrüßungen)
- Füllwörter, Versprecher, triviale Zwischenbemerkungen
- Technische Störungen

FORMAT:
- Kurze TOPs (< 10 Äußerungen): 1-2 Absätze
- Mittlere TOPs (10-50 Äußerungen): 2-3 Absätze
- Lange TOPs (> 50 Äußerungen): 3-5 Absätze
- Chronologischer Ablauf
- Direkt mit Inhalt beginnen, keine Einleitung
"""


def summarize_segment(
    top_title: str,
    transcript_text: str,
    model: Optional[str] = None,
    system_prompt: Optional[str] = None,
) -> str:
    """
    Generate a summary for a meeting segment (TOP) using Ollama.

    Args:
        top_title: Title of the agenda item (TOP)
        transcript_text: Full transcript text for this TOP
        model: LLM model to use (default: from env or qwen3:8b)
        system_prompt: Custom system prompt (default: DEFAULT_SYSTEM_PROMPT)

    Returns:
        Summary text in German

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
        api_key="ollama",  # Ollama doesn't require a real API key
    )

    # Use provided values or fall back to defaults
    actual_model = model or LLM_MODEL
    actual_system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT

    user_prompt = f"""Erstelle eine Zusammenfassung für folgenden Tagesordnungspunkt:

TOP: {top_title}

Transkript:
{transcript_text}

Zusammenfassung:"""

    response = client.chat.completions.create(
        model=actual_model,
        messages=[
            {"role": "system", "content": actual_system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=1024,
        temperature=0.3,  # Lower temperature for more consistent output
    )

    return response.choices[0].message.content or ""


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
