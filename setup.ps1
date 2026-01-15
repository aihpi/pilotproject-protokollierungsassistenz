#
# Protokollierungsassistenz - Setup Script for Windows
# This script sets up the Meeting Minutes Assistant on your local machine.
#
# Requirements:
# - Docker Desktop installed
# - Internet connection (for downloading images ~6GB + LLM model ~5GB)
# - At least 25GB free disk space
# - At least 8GB RAM
#
# Usage: Right-click and "Run with PowerShell" or run in PowerShell:
#   .\setup.ps1
#

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Info { Write-Host "[INFO] " -ForegroundColor Blue -NoNewline; Write-Host $args }
function Write-Success { Write-Host "[OK] " -ForegroundColor Green -NoNewline; Write-Host $args }
function Write-Warn { Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $args }
function Write-Error { Write-Host "[ERROR] " -ForegroundColor Red -NoNewline; Write-Host $args }

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  Protokollierungsassistenz - Setup" -ForegroundColor Cyan
Write-Host "  Meeting Minutes Assistant" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Step 1: Check Docker installation
Write-Info "Checking Docker installation..."

$dockerInstalled = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerInstalled) {
    Write-Error "Docker is not installed!"
    Write-Host ""
    Write-Host "Please install Docker Desktop from:"
    Write-Host "  https://docs.docker.com/desktop/install/windows-install/"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

try {
    docker info 2>&1 | Out-Null
} catch {
    Write-Error "Docker is installed but not running!"
    Write-Host ""
    Write-Host "Please start Docker Desktop and try again."
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Success "Docker is installed and running"

# Step 2: Check disk space (need at least 25GB)
Write-Info "Checking available disk space..."

$drive = (Get-Location).Drive.Name
$disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='${drive}:'"
$availableGB = [math]::Floor($disk.FreeSpace / 1GB)

if ($availableGB -lt 25) {
    Write-Error "Not enough disk space! Available: ${availableGB}GB, Required: 25GB"
    Write-Host ""
    Write-Host "Please free up some disk space and try again."
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Success "Disk space OK (${availableGB}GB available)"

# Step 3: Check RAM (need at least 8GB)
Write-Info "Checking available RAM..."

$totalRAM = [math]::Floor((Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory / 1GB)

if ($totalRAM -lt 8) {
    Write-Warn "Low RAM detected (${totalRAM}GB). Recommended: 8GB+"
    Write-Host "The application may run slowly."
} else {
    Write-Success "RAM OK (${totalRAM}GB available)"
}

# Step 4: Check for NVIDIA GPU
$useGPU = $false
Write-Info "Checking for NVIDIA GPU..."

$nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($nvidiaSmi) {
    try {
        nvidia-smi 2>&1 | Out-Null
        Write-Success "NVIDIA GPU detected!"
        Write-Host ""
        Write-Host "GPU mode provides significantly faster transcription."
        $response = Read-Host "Do you want to use GPU mode? (y/N)"

        if ($response -match "^[Yy]$") {
            # Check for NVIDIA Container Toolkit
            $dockerInfo = docker info 2>&1
            if ($dockerInfo -match "nvidia") {
                $useGPU = $true
                Write-Success "GPU mode enabled"
            } else {
                Write-Warn "NVIDIA Container Toolkit may not be configured"
                Write-Host "To use GPU mode, ensure Docker Desktop has GPU support enabled."
                Write-Host "See: https://docs.docker.com/desktop/gpu/"
                Write-Host ""
                $continue = Read-Host "Try GPU mode anyway? (y/N)"
                if ($continue -match "^[Yy]$") {
                    $useGPU = $true
                } else {
                    Write-Host "Continuing with CPU mode..."
                }
            }
        }
    } catch {
        Write-Info "No NVIDIA GPU detected, using CPU mode"
    }
} else {
    Write-Info "No NVIDIA GPU detected, using CPU mode"
}

# Step 5: Create uploads directory
New-Item -ItemType Directory -Force -Path "uploads" | Out-Null

# Step 6: Start the application
Write-Host ""
Write-Info "Starting the application..."
Write-Host "This will download pre-built images (~6GB) and the summarization model (~5GB)."
Write-Host "This may take 5-15 minutes depending on your internet speed."
Write-Host ""

if ($useGPU) {
    Write-Info "Starting in GPU mode..."
    docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
} else {
    Write-Info "Starting in CPU mode..."
    docker compose up -d
}

# Step 7: Wait for services to be ready
Write-Host ""
Write-Info "Waiting for services to start..."
Write-Host "The system is loading AI models. This may take a few minutes."
Write-Host ""

$maxWait = 600  # 10 minutes
$waitCount = 0
$ready = $false

while ($waitCount -lt $maxWait) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8010/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        # Service not ready yet
    }

    # Show progress every 10 seconds
    if ($waitCount % 10 -eq 0) {
        Write-Host "  Still starting... (${waitCount}s elapsed)"
    }

    Start-Sleep -Seconds 1
    $waitCount++
}

if (-not $ready) {
    Write-Warn "Services are still starting. You can check the status with:"
    Write-Host "  docker compose logs -f"
    Write-Host ""
    Write-Host "Once ready, open: http://localhost:3000"
} else {
    Write-Host ""
    Write-Success "Application is ready!"
    Write-Host ""
    Write-Host "==============================================" -ForegroundColor Cyan
    Write-Host "  Setup Complete!" -ForegroundColor Cyan
    Write-Host "==============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Open your browser and go to:"
    Write-Host "  http://localhost:3000" -ForegroundColor Green
    Write-Host ""
    Write-Host "Useful commands:"
    Write-Host "  Stop:    docker compose down"
    Write-Host "  Restart: docker compose up -d"
    Write-Host "  Logs:    docker compose logs -f"
    Write-Host ""

    # Open browser automatically
    Start-Process "http://localhost:3000"
}

Write-Host ""
Read-Host "Press Enter to close this window"
