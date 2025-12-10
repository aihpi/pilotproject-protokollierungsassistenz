# Backend Dockerfile for CPU-only deployment
# For GPU support, use nvidia/cuda base image

FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (ffmpeg required by whisperx)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
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

# Expose port
EXPOSE 8010

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8010"]
