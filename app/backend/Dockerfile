# Backend Dockerfile for CPU-only deployment with pre-bundled ML models
# For GPU support, use Dockerfile.gpu
#
# Build with: docker build --build-arg HF_TOKEN=your_token -t backend:cpu .

FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (ffmpeg required by whisperx, curl for health checks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install uv for package management
RUN pip install uv

# Copy project files
COPY pyproject.toml ./
COPY *.py ./

# Create uploads directory
RUN mkdir -p uploads

# Install dependencies
RUN uv pip install --system -e .

# Build argument for HuggingFace token (used only during build to download models)
ARG HF_TOKEN

# Set cache directories inside the container
ENV HF_HOME=/app/.cache/huggingface
ENV TORCH_HOME=/app/.cache/torch

# Download all ML models at build time
# This eliminates the need for HF_TOKEN at runtime
RUN python -c "
import os
os.environ['TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD'] = '1'

print('=' * 60)
print('DOWNLOADING ML MODELS (this may take 10-20 minutes)')
print('=' * 60)

print('')
print('[1/3] Downloading WhisperX model (large-v2, ~3.1 GB)...')
import whisperx
model = whisperx.load_model('large-v2', 'cpu', compute_type='int8', language='de')
del model
print('[1/3] WhisperX model downloaded successfully')

print('')
print('[2/3] Downloading German alignment model (~360 MB)...')
align_model, metadata = whisperx.load_align_model(language_code='de', device='cpu')
del align_model, metadata
print('[2/3] Alignment model downloaded successfully')

print('')
print('[3/3] Downloading PyAnnote diarization model (~190 MB)...')
from whisperx.diarize import DiarizationPipeline
hf_token = os.environ.get('HF_TOKEN')
if not hf_token:
    raise ValueError('HF_TOKEN build argument required for downloading diarization model')
diarize = DiarizationPipeline(use_auth_token=hf_token, device='cpu')
del diarize
print('[3/3] Diarization model downloaded successfully')

print('')
print('=' * 60)
print('ALL MODELS DOWNLOADED SUCCESSFULLY')
print('=' * 60)
"

# Clear the HF_TOKEN from environment (security: don't leak token in final image)
ENV HF_TOKEN=

# Set flag indicating models are pre-cached (runtime won't require HF_TOKEN)
ENV MODELS_PRECACHED=1

# Expose port
EXPOSE 8010

# Health check with reduced start_period since models are pre-loaded
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=120s \
    CMD curl -f http://localhost:8010/health || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8010"]
