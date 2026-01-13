"""
FastAPI Backend for Meeting Minutes Generator
"""

import os
import re
import uuid
import time
import logging
import mimetypes
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from transcribe import transcribe_audio, load_models, TranscriptionModels
from summarize import summarize_segment
from extract_tops import extract_tops_from_pdf

# Configure logging with timestamps
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan event handler.
    Loads all ML models at startup and cleans up on shutdown.
    """
    logger.info("Server starting up - loading transcription models...")

    try:
        # Load models at startup (this takes several minutes)
        app.state.models = load_models()
        app.state.models_loaded = True
        logger.info("Models loaded successfully - server ready")
    except Exception as e:
        logger.error(f"Failed to load models: {e}", exc_info=True)
        app.state.models = None
        app.state.models_loaded = False

    yield  # Server is running

    # Cleanup on shutdown
    logger.info("Server shutting down - cleaning up...")
    app.state.models = None
    app.state.models_loaded = False


app = FastAPI(
    title="Sitzungsprotokoll Generator API",
    description="API für die automatische Erstellung von Sitzungsprotokollen",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration - allow configurable origins via environment
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:3000",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Job cleanup configuration
JOB_MAX_AGE_SECONDS = int(os.environ.get("JOB_MAX_AGE_SECONDS", "7200"))  # 2 hours
JOB_MAX_COUNT = int(os.environ.get("JOB_MAX_COUNT", "100"))

# In-memory storage for jobs (in production, use Redis or database)
jobs: OrderedDict = OrderedDict()

# Temporary upload directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


def cleanup_old_jobs() -> int:
    """
    Remove old or excess jobs from memory.
    Also cleans up associated audio files.
    Returns number of jobs removed.
    """
    now = time.time()
    removed = 0

    def cleanup_job_audio(job_id: str, job_data: dict) -> None:
        """Clean up audio file associated with a job."""
        audio_path = job_data.get("audio_path")
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                logger.info(f"Cleaned up audio file for job {job_id}")
            except Exception as e:
                logger.warning(f"Failed to clean up audio file for job {job_id}: {e}")

    # Remove jobs older than MAX_AGE
    jobs_to_remove = []
    for job_id, job_data in jobs.items():
        if now - job_data.get("created_at", now) > JOB_MAX_AGE_SECONDS:
            jobs_to_remove.append(job_id)

    for job_id in jobs_to_remove:
        cleanup_job_audio(job_id, jobs[job_id])
        del jobs[job_id]
        removed += 1

    # Remove oldest jobs if count exceeds MAX_COUNT
    while len(jobs) > JOB_MAX_COUNT:
        oldest_job_id = next(iter(jobs))
        cleanup_job_audio(oldest_job_id, jobs[oldest_job_id])
        del jobs[oldest_job_id]
        removed += 1

    if removed > 0:
        logger.info(f"Cleaned up {removed} old jobs, {len(jobs)} remaining")

    return removed


# ----- Pydantic Models -----


class TranscriptLine(BaseModel):
    speaker: str
    text: str
    start: float  # Start time in seconds
    end: float  # End time in seconds


class TranscriptionJob(BaseModel):
    job_id: str
    status: str  # "pending", "processing", "completed", "failed"
    progress: int
    message: str
    transcript: Optional[List[TranscriptLine]] = None
    audio_url: Optional[str] = None  # URL to stream audio for playback
    error: Optional[str] = None


class SummarizeRequest(BaseModel):
    top_title: str
    lines: List[TranscriptLine]
    model: Optional[str] = None  # LLM model to use (e.g., "qwen3:8b")
    system_prompt: Optional[str] = None  # Custom system prompt


class SummarizeResponse(BaseModel):
    summary: str


class ExtractTOPsResponse(BaseModel):
    tops: List[str]


# ----- Endpoints -----


@app.get("/")
async def root():
    return {"message": "Sitzungsprotokoll Generator API", "version": "0.1.0"}


@app.get("/health")
async def health_check():
    """
    Health check endpoint for Docker/Kubernetes.
    Returns 200 only when models are loaded and server is ready.
    """
    if not getattr(app.state, "models_loaded", False):
        raise HTTPException(
            status_code=503,
            detail="Models not loaded yet - server starting up"
        )
    return {
        "status": "healthy",
        "models_loaded": True,
        "version": "0.1.0"
    }


@app.post("/api/transcribe", response_model=TranscriptionJob)
async def start_transcription(
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(...),
):
    """
    Upload audio file and start transcription job.
    Returns job_id to poll for status.
    """
    logger.info(f"Received transcription request: {audio.filename} ({audio.content_type})")

    # Check if models are loaded
    if not getattr(app.state, "models_loaded", False) or app.state.models is None:
        logger.error("Transcription request rejected - models not loaded")
        raise HTTPException(
            status_code=503,
            detail="Server startet noch - Modelle werden geladen. Bitte warten."
        )

    # Validate file type
    allowed_types = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/mp3"]
    if audio.content_type not in allowed_types and not audio.filename.endswith(
        (".mp3", ".wav", ".m4a")
    ):
        logger.warning(f"Rejected file with invalid type: {audio.content_type}")
        raise HTTPException(
            status_code=400, detail=f"Ungültiger Dateityp. Erlaubt: MP3, WAV, M4A"
        )

    # Generate job ID
    job_id = str(uuid.uuid4())
    logger.info(f"Created job: {job_id}")

    # Save uploaded file
    file_path = UPLOAD_DIR / f"{job_id}_{audio.filename}"
    with open(file_path, "wb") as f:
        content = await audio.read()
        f.write(content)
    logger.info(f"Saved file: {file_path} ({len(content)} bytes)")

    # Initialize job with timestamp
    jobs[job_id] = {
        "created_at": time.time(),
        "status": "pending",
        "progress": 0,
        "message": "Audio hochgeladen",
        "file_path": str(file_path),
        "transcript": None,
        "error": None,
    }

    # Cleanup old jobs to prevent memory buildup
    cleanup_old_jobs()

    # Start background transcription with pre-loaded models
    logger.info(f"Starting background transcription task for job: {job_id}")
    background_tasks.add_task(run_transcription, job_id, str(file_path), app.state.models)

    return TranscriptionJob(
        job_id=job_id,
        status="pending",
        progress=0,
        message="Transkription gestartet",
    )


@app.get("/api/transcribe/{job_id}", response_model=TranscriptionJob)
async def get_transcription_status(job_id: str):
    """
    Get status of transcription job.
    """
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job nicht gefunden")

    job = jobs[job_id]

    # Generate audio URL if audio file is available
    audio_url = None
    audio_path = job.get("audio_path")
    if audio_path and os.path.exists(audio_path):
        audio_url = f"/api/audio/{job_id}"

    return TranscriptionJob(
        job_id=job_id,
        status=job["status"],
        progress=job["progress"],
        message=job["message"],
        transcript=(
            [TranscriptLine(**line) for line in job["transcript"]]
            if job["transcript"]
            else None
        ),
        audio_url=audio_url,
        error=job["error"],
    )


@app.get("/api/audio/{job_id}")
async def stream_audio(
    job_id: str,
    range: Optional[str] = Header(None, alias="Range"),
):
    """
    Stream audio file for a transcription job.
    Supports HTTP Range requests for efficient seeking.
    """
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job nicht gefunden")

    job = jobs[job_id]
    audio_path = job.get("audio_path")

    if not audio_path or not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio nicht mehr verfügbar")

    file_size = os.path.getsize(audio_path)

    # Determine content type
    content_type, _ = mimetypes.guess_type(audio_path)
    if not content_type:
        content_type = "audio/mpeg"

    # Handle Range requests for seeking
    if range:
        # Parse range header: "bytes=start-end"
        range_match = re.match(r"bytes=(\d+)-(\d*)", range)
        if range_match:
            start = int(range_match.group(1))
            end = int(range_match.group(2)) if range_match.group(2) else file_size - 1

            if start >= file_size:
                raise HTTPException(status_code=416, detail="Range Not Satisfiable")

            chunk_size = end - start + 1

            with open(audio_path, "rb") as f:
                f.seek(start)
                data = f.read(chunk_size)

            return Response(
                content=data,
                status_code=206,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(chunk_size),
                    "Content-Type": content_type,
                },
            )

    # Return full file if no range requested
    with open(audio_path, "rb") as f:
        data = f.read()

    return Response(
        content=data,
        status_code=200,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": content_type,
        },
    )


@app.post("/api/summarize", response_model=SummarizeResponse)
async def generate_summary(request: SummarizeRequest):
    """
    Generate summary for a TOP segment.
    """
    if not request.lines:
        raise HTTPException(status_code=400, detail="Keine Zeilen zum Zusammenfassen")

    # Combine lines into text
    text = "\n".join([f"{line.speaker}: {line.text}" for line in request.lines])

    try:
        summary = summarize_segment(
            request.top_title,
            text,
            model=request.model,
            system_prompt=request.system_prompt,
        )
        return SummarizeResponse(summary=summary)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Fehler bei der Zusammenfassung: {str(e)}"
        )


@app.post("/api/extract-tops", response_model=ExtractTOPsResponse)
async def extract_tops_endpoint(
    pdf: UploadFile = File(...),
    model: Optional[str] = Form(None),
    system_prompt: Optional[str] = Form(None),
):
    """
    Extract TOPs (agenda items) from a German municipal meeting invitation PDF.
    Uses LLM to intelligently parse the document structure.
    """
    logger.info(f"Received PDF for TOP extraction: {pdf.filename} ({pdf.content_type})")

    # Validate file type
    if pdf.content_type != "application/pdf" and not pdf.filename.endswith(".pdf"):
        logger.warning(f"Rejected non-PDF file: {pdf.content_type}")
        raise HTTPException(
            status_code=400,
            detail="Nur PDF-Dateien sind erlaubt"
        )

    # Save uploaded file temporarily
    file_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{file_id}_{pdf.filename}"

    try:
        with open(file_path, "wb") as f:
            content = await pdf.read()
            f.write(content)
        logger.info(f"Saved PDF: {file_path} ({len(content)} bytes)")

        # Extract TOPs using LLM
        tops = extract_tops_from_pdf(
            str(file_path),
            model=model,
            system_prompt=system_prompt,
        )

        logger.info(f"Successfully extracted {len(tops)} TOPs from {pdf.filename}")
        return ExtractTOPsResponse(tops=tops)

    except Exception as e:
        logger.error(f"TOP extraction failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Fehler bei der TOP-Extraktion: {str(e)}"
        )

    finally:
        # Clean up uploaded file
        try:
            if file_path.exists():
                os.remove(file_path)
                logger.info(f"Cleaned up PDF file: {file_path}")
        except Exception as cleanup_error:
            logger.warning(f"Failed to clean up PDF: {cleanup_error}")


# ----- Background Tasks -----


def run_transcription(job_id: str, file_path: str, models: TranscriptionModels):
    """
    Run transcription in background using pre-loaded models.
    """
    logger.info(f"[Job {job_id}] Background task started")
    try:
        # Update progress
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 10
        jobs[job_id]["message"] = "Transkription wird vorbereitet..."
        logger.info(f"[Job {job_id}] Status: processing, preparing transcription...")

        # Run transcription with pre-loaded models
        def progress_callback(progress: int, message: str):
            jobs[job_id]["progress"] = progress
            jobs[job_id]["message"] = message
            logger.info(f"[Job {job_id}] Progress: {progress}% - {message}")

        transcript = transcribe_audio(file_path, models, progress_callback)

        # Update job with result
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["message"] = "Transkription abgeschlossen"
        jobs[job_id]["transcript"] = transcript
        # Keep audio_path for streaming playback (will be cleaned up when job expires)
        jobs[job_id]["audio_path"] = file_path
        logger.info(f"[Job {job_id}] Transcription completed successfully with {len(transcript)} lines")

    except Exception as e:
        logger.error(f"[Job {job_id}] Transcription failed: {str(e)}", exc_info=True)
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["message"] = f"Fehler: {str(e)}"

        # Clean up GPU memory even on failure
        try:
            import gc
            import torch
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                logger.info(f"[Job {job_id}] GPU memory cleared after error")
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8010)
