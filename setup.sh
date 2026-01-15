#!/bin/bash
#
# Protokollierungsassistenz - Setup Script for macOS/Linux
# This script sets up the Meeting Minutes Assistant on your local machine.
#
# Requirements:
# - Docker Desktop installed
# - Internet connection (for downloading images ~6GB + LLM model ~5GB)
# - At least 25GB free disk space
# - At least 8GB RAM
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored messages
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "=============================================="
echo "  Protokollierungsassistenz - Setup"
echo "  Meeting Minutes Assistant"
echo "=============================================="
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Check Docker installation
info "Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    error "Docker is not installed!"
    echo ""
    echo "Please install Docker Desktop:"
    echo "  - macOS: https://docs.docker.com/desktop/install/mac-install/"
    echo "  - Linux: https://docs.docker.com/desktop/install/linux-install/"
    echo ""
    exit 1
fi

if ! docker info &> /dev/null; then
    error "Docker is installed but not running!"
    echo ""
    echo "Please start Docker Desktop and try again."
    exit 1
fi
success "Docker is installed and running"

# Step 2: Check disk space (need at least 25GB)
info "Checking available disk space..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    AVAILABLE_GB=$(df -g . | tail -1 | awk '{print $4}')
else
    # Linux
    AVAILABLE_GB=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
fi

if [ "$AVAILABLE_GB" -lt 25 ]; then
    error "Not enough disk space! Available: ${AVAILABLE_GB}GB, Required: 25GB"
    echo ""
    echo "Please free up some disk space and try again."
    exit 1
fi
success "Disk space OK (${AVAILABLE_GB}GB available)"

# Step 3: Check RAM (need at least 8GB)
info "Checking available RAM..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    TOTAL_RAM_GB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
else
    # Linux
    TOTAL_RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
fi

if [ "$TOTAL_RAM_GB" -lt 8 ]; then
    warn "Low RAM detected (${TOTAL_RAM_GB}GB). Recommended: 8GB+"
    echo "The application may run slowly."
else
    success "RAM OK (${TOTAL_RAM_GB}GB available)"
fi

# Step 4: Check for NVIDIA GPU (Linux only)
USE_GPU=false
if [[ "$OSTYPE" != "darwin"* ]]; then
    info "Checking for NVIDIA GPU..."
    if command -v nvidia-smi &> /dev/null; then
        if nvidia-smi &> /dev/null; then
            success "NVIDIA GPU detected!"
            echo ""
            echo "GPU mode provides significantly faster transcription."
            read -p "Do you want to use GPU mode? (y/N): " -n 1 -r
            echo ""
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                # Check for NVIDIA Container Toolkit
                if docker info 2>/dev/null | grep -q "nvidia"; then
                    USE_GPU=true
                    success "GPU mode enabled"
                else
                    warn "NVIDIA Container Toolkit not detected"
                    echo "To use GPU mode, please install nvidia-container-toolkit:"
                    echo "  https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html"
                    echo ""
                    echo "Continuing with CPU mode..."
                fi
            fi
        fi
    else
        info "No NVIDIA GPU detected, using CPU mode"
    fi
else
    info "macOS detected - using CPU mode (NVIDIA GPUs not supported on Mac)"
fi

# Step 5: Create uploads directory
mkdir -p uploads

# Step 6: Start the application
echo ""
info "Starting the application..."
echo "This will download pre-built images (~6GB) and the summarization model (~5GB)."
echo "This may take 5-15 minutes depending on your internet speed."
echo ""

if [ "$USE_GPU" = true ]; then
    info "Starting in GPU mode..."
    docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
else
    info "Starting in CPU mode..."
    docker compose up -d
fi

# Step 7: Wait for services to be ready
echo ""
info "Waiting for services to start..."
echo "The system is loading AI models. This may take a few minutes."
echo ""

# Wait for backend to be healthy (with progress indicator)
MAX_WAIT=600  # 10 minutes
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -s http://localhost:8010/health > /dev/null 2>&1; then
        break
    fi

    # Show progress every 10 seconds
    if [ $((WAIT_COUNT % 10)) -eq 0 ]; then
        echo "  Still starting... (${WAIT_COUNT}s elapsed)"
    fi

    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    warn "Services are still starting. You can check the status with:"
    echo "  docker compose logs -f"
    echo ""
    echo "Once ready, open: http://localhost:3000"
else
    echo ""
    success "Application is ready!"
    echo ""
    echo "=============================================="
    echo "  Setup Complete!"
    echo "=============================================="
    echo ""
    echo "Open your browser and go to:"
    echo "  http://localhost:3000"
    echo ""
    echo "Useful commands:"
    echo "  Stop:    docker compose down"
    echo "  Restart: docker compose up -d"
    echo "  Logs:    docker compose logs -f"
    echo ""

    # Try to open browser automatically
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open http://localhost:3000 2>/dev/null || true
    elif command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:3000 2>/dev/null || true
    fi
fi
