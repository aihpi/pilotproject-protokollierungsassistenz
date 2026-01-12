"""
FastAPI Backend for Meeting Minutes Generator
"""

import os
import uuid
import time
import logging
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from transcribe import transcribe_audio, load_models, TranscriptionModels
from summarize import summarize_segment

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
    Returns number of jobs removed.
    """
    now = time.time()
    removed = 0

    # Remove jobs older than MAX_AGE
    jobs_to_remove = []
    for job_id, job_data in jobs.items():
        if now - job_data.get("created_at", now) > JOB_MAX_AGE_SECONDS:
            jobs_to_remove.append(job_id)

    for job_id in jobs_to_remove:
        del jobs[job_id]
        removed += 1

    # Remove oldest jobs if count exceeds MAX_COUNT
    while len(jobs) > JOB_MAX_COUNT:
        oldest_job_id = next(iter(jobs))
        del jobs[oldest_job_id]
        removed += 1

    if removed > 0:
        logger.info(f"Cleaned up {removed} old jobs, {len(jobs)} remaining")

    return removed


# ----- Pydantic Models -----


class TranscriptLine(BaseModel):
    speaker: str
    text: str


class TranscriptionJob(BaseModel):
    job_id: str
    status: str  # "pending", "processing", "completed", "failed"
    progress: int
    message: str
    transcript: Optional[List[TranscriptLine]] = None
    error: Optional[str] = None


class SummarizeRequest(BaseModel):
    top_title: str
    lines: List[TranscriptLine]


class SummarizeResponse(BaseModel):
    summary: str


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
        error=job["error"],
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
        summary = summarize_segment(request.top_title, text)
        return SummarizeResponse(summary=summary)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Fehler bei der Zusammenfassung: {str(e)}"
        )


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
        logger.info(f"[Job {job_id}] Transcription completed successfully with {len(transcript)} lines")

        # Clean up uploaded file
        try:
            os.remove(file_path)
            logger.info(f"[Job {job_id}] Cleaned up uploaded file: {file_path}")
        except Exception as cleanup_error:
            logger.warning(f"[Job {job_id}] Failed to clean up file: {cleanup_error}")

    except Exception as e:
        logger.error(f"[Job {job_id}] Transcription failed: {str(e)}", exc_info=True)
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["message"] = f"Fehler: {str(e)}"


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8010)
