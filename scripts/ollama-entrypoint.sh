#!/bin/bash
# Ollama entrypoint script that automatically pulls models on first start
# This eliminates the manual "docker compose exec ollama ollama pull" step

set -e

# Models to pull on first start. OLLAMA_MODEL is the "standard" config model;
# GEMMA_MODEL (optional) backs the "gemma" config. Deduplicated, blanks skipped.
MODELS=()
for m in "${OLLAMA_MODEL:-qwen3:8b}" "${GEMMA_MODEL:-}"; do
    [ -z "$m" ] && continue
    skip=
    for seen in "${MODELS[@]}"; do [ "$seen" = "$m" ] && skip=1; done
    [ -z "$skip" ] && MODELS+=("$m")
done

echo "Starting Ollama server..."
# Start Ollama in the background
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "Waiting for Ollama to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
while ! ollama list > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "Error: Ollama failed to start after $MAX_RETRIES attempts"
        exit 1
    fi
    echo "  Attempt $RETRY_COUNT/$MAX_RETRIES - Ollama not ready yet..."
    sleep 2
done
echo "Ollama is ready!"

# Pull each configured model that is not already present
for MODEL in "${MODELS[@]}"; do
    echo "Checking if model '$MODEL' is available..."
    if ollama list | grep -q "^$MODEL"; then
        echo "Model '$MODEL' is already downloaded."
    else
        echo "Model '$MODEL' not found. Downloading..."
        echo "This may take several minutes depending on your internet connection."
        echo ""
        ollama pull "$MODEL"
        echo ""
        echo "Model '$MODEL' downloaded successfully!"
    fi
done

echo ""
echo "============================================"
echo "Ollama is ready with models: ${MODELS[*]}"
echo "============================================"
echo ""

# Wait for the Ollama process to keep container running
wait $OLLAMA_PID
