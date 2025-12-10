"""
FastAPI Backend for Meeting Minutes Generator
"""

import os
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from transcribe import transcribe_audio
from summarize import summarize_segment

app = FastAPI(
    title="Sitzungsprotokoll Generator API",
    description="API für die automatische Erstellung von Sitzungsprotokollen",
    version="0.1.0",
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

# In-memory storage for jobs (in production, use Redis or database)
jobs: dict = {}

# Temporary upload directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


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


@app.post("/api/transcribe", response_model=TranscriptionJob)
async def start_transcription(
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(...),
):
    """
    Upload audio file and start transcription job.
    Returns job_id to poll for status.
    """
    # Validate file type
    allowed_types = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/mp3"]
    if audio.content_type not in allowed_types and not audio.filename.endswith(
        (".mp3", ".wav", ".m4a")
    ):
        raise HTTPException(
            status_code=400, detail=f"Ungültiger Dateityp. Erlaubt: MP3, WAV, M4A"
        )

    # Generate job ID
    job_id = str(uuid.uuid4())

    # Save uploaded file
    file_path = UPLOAD_DIR / f"{job_id}_{audio.filename}"
    with open(file_path, "wb") as f:
        content = await audio.read()
        f.write(content)

    # Initialize job
    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "message": "Audio hochgeladen",
        "file_path": str(file_path),
        "transcript": None,
        "error": None,
    }

    # Start background transcription
    background_tasks.add_task(run_transcription, job_id, str(file_path))

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


def run_transcription(job_id: str, file_path: str):
    """
    Run transcription in background.
    """
    try:
        # Update progress
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 10
        jobs[job_id]["message"] = "Transkription wird vorbereitet..."

        # Run transcription
        def progress_callback(progress: int, message: str):
            jobs[job_id]["progress"] = progress
            jobs[job_id]["message"] = message

        transcript = transcribe_audio(file_path, progress_callback)

        # Update job with result
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["message"] = "Transkription abgeschlossen"
        jobs[job_id]["transcript"] = transcript

        # Clean up uploaded file
        try:
            os.remove(file_path)
        except:
            pass

    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["message"] = f"Fehler: {str(e)}"


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8010)
