"""
Transcription module using WhisperX with speaker diarization.

Setup:
1. Install WhisperX: uv sync --extra whisperx
2. Set HuggingFace token: export HF_TOKEN=your_token

Configuration via environment variables:
- HF_TOKEN: HuggingFace token for pyannote diarization (required)
- WHISPER_MODEL: Whisper model size (default: large-v2)
- WHISPER_DEVICE: Device to use - cuda/cpu (default: auto-detect)
- WHISPER_BATCH_SIZE: Batch size for transcription (default: 16)
- WHISPER_LANGUAGE: Language code (default: de)
"""

import os
import re
from typing import List, Dict, Callable, Optional

# WhisperX configuration
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v2")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "auto")
WHISPER_BATCH_SIZE = int(os.environ.get("WHISPER_BATCH_SIZE", "16"))
WHISPER_LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "de")


def transcribe_audio(
    file_path: str,
    progress_callback: Optional[Callable[[int, str], None]] = None,
) -> List[Dict[str, str]]:
    """
    Transcribe audio file with speaker diarization using WhisperX.

    Args:
        file_path: Path to audio file (MP3, WAV, M4A)
        progress_callback: Optional callback for progress updates (progress%, message)

    Returns:
        List of dicts with 'speaker' and 'text' keys

    Requires:
    - whisperx package: uv sync --extra whisperx
    - CUDA-capable GPU (recommended) or CPU
    - HuggingFace token for pyannote: export HF_TOKEN=your_token
    """
    try:
        import whisperx
        import torch
    except ImportError:
        raise RuntimeError(
            "WhisperX nicht installiert. Installieren Sie mit: uv sync --extra whisperx"
        )

    # Determine device
    if WHISPER_DEVICE == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    else:
        device = WHISPER_DEVICE

    compute_type = "float16" if device == "cuda" else "int8"

    if progress_callback:
        progress_callback(5, f"Lade WhisperX Modell ({WHISPER_MODEL})...")

    # Load model
    model = whisperx.load_model(
        WHISPER_MODEL,
        device,
        compute_type=compute_type,
        language=WHISPER_LANGUAGE,
    )

    if progress_callback:
        progress_callback(15, "Lade Audio...")

    # Load audio
    audio = whisperx.load_audio(file_path)

    if progress_callback:
        progress_callback(25, "Transkription läuft...")

    # Transcribe
    result = model.transcribe(
        audio,
        batch_size=WHISPER_BATCH_SIZE,
        language=WHISPER_LANGUAGE,
    )

    if progress_callback:
        progress_callback(50, "Alignment läuft...")

    # Align whisper output
    model_a, metadata = whisperx.load_align_model(
        language_code=WHISPER_LANGUAGE,
        device=device,
    )
    result = whisperx.align(
        result["segments"],
        model_a,
        metadata,
        audio,
        device,
        return_char_alignments=False,
    )

    if progress_callback:
        progress_callback(65, "Sprechererkennung läuft...")

    # Speaker diarization
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        raise RuntimeError(
            "HuggingFace Token nicht gesetzt. "
            "Setzen Sie die HF_TOKEN Umgebungsvariable. "
            "Token erstellen unter: https://huggingface.co/settings/tokens"
        )

    diarize_model = whisperx.DiarizationPipeline(
        use_auth_token=hf_token,
        device=device,
    )
    diarize_segments = diarize_model(audio)

    if progress_callback:
        progress_callback(85, "Segmente werden zusammengeführt...")

    # Assign speakers to segments
    result = whisperx.assign_word_speakers(diarize_segments, result)

    if progress_callback:
        progress_callback(95, "Transkript wird erstellt...")

    # Convert to our format
    transcript = []
    for segment in result["segments"]:
        speaker = segment.get("speaker", "UNKNOWN")
        text = segment.get("text", "").strip()
        if text:
            transcript.append({
                "speaker": speaker,
                "text": text,
            })

    return transcript


def parse_transcript_file(file_path: str) -> List[Dict[str, str]]:
    """
    Parse existing transcript file in [SPEAKER_XX]: text format.
    Useful for loading pre-generated transcripts.
    """
    transcript = []
    pattern = r"\[SPEAKER_(\d+)\]:\s*(.+)"

    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            match = re.match(pattern, line)
            if match:
                speaker_id = match.group(1)
                text = match.group(2).strip()
                if text:
                    transcript.append({
                        "speaker": f"SPEAKER_{speaker_id}",
                        "text": text,
                    })

    return transcript
