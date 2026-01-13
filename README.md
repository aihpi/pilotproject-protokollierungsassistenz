# Protokollierungsassistenz

Automatic transcription and meeting minutes generation from audio recordings of German municipal meetings.

## Overview

This application provides a web-based workflow for generating meeting minutes (Sitzungsprotokolle) from audio recordings:

1. **Upload** - Upload audio recording and enter agenda items (Tagesordnungspunkte/TOPs)
2. **Transcribe** - Automatic transcription with speaker diarization using WhisperX + PyAnnote
3. **Assign** - Manually assign transcript segments to each TOP
4. **Summarize** - Generate summaries per TOP using an LLM (Qwen3 8B via Ollama)
5. **Export** - Download the final meeting minutes

## Project Structure

```
tuiv/
├── app/
│   ├── frontend/          # React + TypeScript web application
│   └── backend/           # FastAPI Python backend
├── examples/              # Sample meeting recordings and documents
├── scripts/               # Utility scripts (transcript segmentation)
└── docker-compose.yml     # Production deployment
```

## Requirements

### Backend

- Python 3.10+
- CUDA-capable GPU (recommended) or CPU
- [HuggingFace account](https://huggingface.co/settings/tokens) with access token
- Ollama running Qwen3 8B

### Frontend

- Node.js 18+

## Development Setup

### 1. Ollama (for summarization)

Install and start Ollama:

```bash
# macOS
brew install ollama

# Start Ollama server
ollama serve

# Pull the model (in another terminal)
ollama pull qwen3:8b
```

Ollama runs on `http://localhost:11434`.

### 2. Backend

```bash
cd app/backend

# Install dependencies with uv
uv sync

# Set environment variables
export HF_TOKEN=your_huggingface_token

# Run development server
uv run uvicorn main:app --port 8010
```

The backend runs on `http://localhost:8010`.

### 3. Frontend

```bash
cd app/frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

The frontend runs on `http://localhost:5173`.

## Production Deployment (Docker)

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your HF_TOKEN

# Build and run all services
docker compose up --build

# Pull the model (first time only)
docker compose exec ollama ollama pull qwen3:8b
```

Services:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8010`
- Ollama: `http://localhost:11434`

## Configuration

### Environment Variables

| Variable             | Description                                         | Default                     |
| -------------------- | --------------------------------------------------- | --------------------------- |
| `HF_TOKEN`           | HuggingFace access token (required for diarization) | -                           |
| `WHISPER_MODEL`      | Whisper model size                                  | `large-v2`                  |
| `WHISPER_DEVICE`     | Device for inference (`cuda`, `cpu`, `auto`)        | `auto`                      |
| `WHISPER_BATCH_SIZE` | Batch size for transcription                        | `16`                        |
| `WHISPER_LANGUAGE`   | Language code                                       | `de`                        |
| `LLM_BASE_URL`       | Ollama API endpoint                                 | `http://localhost:11434/v1` |
| `LLM_MODEL`          | Model name for summarization                        | `qwen3:8b`                  |
| `CORS_ORIGINS`       | Allowed CORS origins (comma-separated)              | `http://localhost:5173,...` |

### Frontend Environment

Create `app/frontend/.env`:

```env
VITE_API_URL=http://localhost:8010
```

## API Endpoints

| Endpoint                   | Method | Description                          |
| -------------------------- | ------ | ------------------------------------ |
| `/`                        | GET    | Health check                         |
| `/api/transcribe`          | POST   | Upload audio and start transcription |
| `/api/transcribe/{job_id}` | GET    | Get transcription job status         |
| `/api/summarize`           | POST   | Generate summary for a TOP segment   |

## Technology Stack

### Frontend

- React 19 with TypeScript
- Vite
- Tailwind CSS

### Backend

- FastAPI
- WhisperX (speech-to-text with word-level timestamps)
- PyAnnote (speaker diarization)
- Ollama with Qwen3 8B (summarization)

## Scripts

### Transcript Segmentation

Automatically segment transcripts by agenda topics using semantic similarity:

```bash
python scripts/segment_transcript.py \
  --transcript examples/20250910_Sondersitzung_KA.txt \
  --agenda examples/Einladung_KA_10_09_2025.pdf
```

## License

Developed at KI-Servicezentrum Berlin-Brandenburg.
