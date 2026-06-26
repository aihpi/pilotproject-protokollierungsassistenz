#!/bin/bash
# Self-check for the model dedup logic in ollama-entrypoint.sh.
# Mirrors the OLLAMA_MODEL + GEMMA_MODEL dedup loop and asserts the result.
# Run: bash scripts/test_ollama_entrypoint_dedup.sh
set -e

dedup() {  # args: OLLAMA_MODEL GEMMA_MODEL -> prints space-joined unique non-empty
    local MODELS=()
    for m in "$1" "$2"; do
        [ -z "$m" ] && continue
        local skip=
        for seen in "${MODELS[@]}"; do [ "$seen" = "$m" ] && skip=1; done
        [ -z "$skip" ] && MODELS+=("$m")
    done
    echo "${MODELS[*]}"
}

assert() {  # $1 expected  $2 actual  $3 label
    if [ "$1" != "$2" ]; then
        echo "FAIL [$3]: expected '$1', got '$2'"; exit 1
    fi
    echo "ok [$3]"
}

assert "qwen3:8b gemma4:12b" "$(dedup qwen3:8b gemma4:12b)" "two distinct -> both"
assert "qwen3:8b"            "$(dedup qwen3:8b qwen3:8b)"   "duplicate -> one"
assert "qwen3:8b"            "$(dedup qwen3:8b '')"          "blank gemma -> one"
echo "all dedup checks passed"
