"""
LLM configuration registry and prompt loading.

Defines the named model configurations the frontend can switch between and loads
their system prompts from .txt files in this directory. All configurations share
the same OpenAI-compatible endpoint (LLM_BASE_URL / LLM_API_KEY, defined in
summarize.py / extract_tops.py); they differ only in the model name and the
system prompt.
"""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

_PROMPT_DIR = Path(__file__).parent

# Default model names. Both configurations talk to the same server, so only the
# model and the prompt differ between them.
DEFAULT_MODEL = os.environ.get("LLM_MODEL", "qwen3:8b")
GEMMA_MODEL = os.environ.get("GEMMA_MODEL", "gemma-4-31b")

# Prompt files that are not tied to a single configuration.
EXTRACTION_PROMPT_FILE = "prompt_extraction.txt"
GENERIC_PROMPT_FILE = "prompt_generic.txt"


@lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    """Read a prompt .txt file from the backend directory (cached per process)."""
    return (_PROMPT_DIR / name).read_text(encoding="utf-8").strip()


@dataclass(frozen=True)
class LLMConfig:
    """A named model configuration the frontend can select by id."""

    id: str
    label: str
    model: str
    prompt_file: str
    prompt_editable: bool

    @property
    def system_prompt(self) -> str:
        return load_prompt(self.prompt_file)


_CONFIGS: dict[str, LLMConfig] = {
    "standard": LLMConfig(
        id="standard",
        label="Standard",
        model=DEFAULT_MODEL,
        prompt_file="prompt_llama.txt",
        prompt_editable=True,
    ),
    # PROVISIONAL: prompt_gemma.txt is a stand-in for the eventual gemma-4-31b-it
    # + LoRA adapter. Replace it with the final LoRA training prompt from
    # build_dataset.py (repo pilotproject-automatic-protocols) before the adapter
    # is served, otherwise inference will not match the trained prompt.
    "gemma": LLMConfig(
        id="gemma",
        label="Landtagstil",
        model=GEMMA_MODEL,
        prompt_file="prompt_gemma.txt",
        prompt_editable=False,
    ),
}

DEFAULT_CONFIG_ID = os.environ.get("LLM_DEFAULT_CONFIG", "standard")


def get_config(config_id: Optional[str]) -> LLMConfig:
    """Resolve a config id. Empty/None -> default config; unknown -> KeyError."""
    if not config_id:
        return _CONFIGS[DEFAULT_CONFIG_ID]
    return _CONFIGS[config_id]


def list_configs() -> list[LLMConfig]:
    """All configurations, in registration order, for the discovery endpoint."""
    return list(_CONFIGS.values())
