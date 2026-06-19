# Handoff: Gemma-4-31B-it + LoRA adapter integration

Branch: `feature/gemma-lora-integration`. This note lets a future session finish and verify the integration of the fine-tuned summarisation model (Google `gemma-4-31B-it` base + a trained PEFT/LoRA adapter) into the Protokollierungsassistenz, as soon as that model is available on the HPI AISC hub.

## Where the pieces live

- **This app**: `aihpi/pilotproject-protokollierungsassistenz` (here). React frontend + FastAPI backend. The LLM is called over an OpenAI-compatible HTTP API in `app/backend/summarize.py` (minutes, per TOP) and `app/backend/extract_tops.py` (PDF agenda extraction). Both read `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY`.
- **The adapter is produced elsewhere**: `pilotproject-automatic-protocols` (the LoRA training repo). It also holds the **training prompt** (the dataset builder, `build_dataset.py`), which is the source of truth for prompt alignment (see issue #6).
- **The model is served**: HPI AISC hub at `https://api.aisc.hpi.de`, OpenAI-compatible. Today it serves only the base `gemma-4-31b` (not `-it`, no adapter).

## What is already done on this branch

Integration is config-only because the backend already speaks the OpenAI HTTP contract. Changes so far:

- `docker-compose.yml`: added `LLM_API_KEY` passthrough to the backend. Ollama is still the default local stack.
- `.env.example` and `app/backend/.env.example`: documented the AISC hub as an alternative to Ollama and added `LLM_API_KEY`.
- No application code changed. Frontend sends an empty `model`, so the backend `LLM_MODEL` env var is the single source of truth for which model is used.

The hub has been smoke-tested with the base model: `POST https://api.aisc.hpi.de/chat/completions` with `model=gemma-4-31b` returns HTTP 200 and a valid German completion. The hub answers 200 both with and without a `/v1` suffix.

## Blocking prerequisites (external, on AISC)

1. The adapter artifact must be exported from `pilotproject-automatic-protocols`.
2. AISC must load the `gemma-4-31B-it` **base** (must match the adapter's training base exactly) **and** the adapter, and return the **served model id**.
3. Confirm whether the hub wants `/v1` on the base URL for the production model.

A LoRA adapter is bonded to its exact training base. If the hub serves a non-`-it` or differently-built base, the adapter will not apply correctly.

## The swap, once the model is on the hub

This is intended to be a one-line change:

1. In the real, git-ignored `.env`, set:
   ```
   LLM_BASE_URL=https://api.aisc.hpi.de        # add /v1 only if AISC confirms it
   LLM_MODEL=<the adapter's served model id>
   LLM_API_KEY=<your key>
   ```
   Nothing else changes. `extract_tops` can keep using the plain base (`gemma-4-31b`); only summarisation benefits from the adapter. If you want to split them, give extract-tops its own model name (currently it shares `LLM_MODEL`).
2. Address prompt alignment (issue #6) before trusting output quality: set `DEFAULT_SYSTEM_PROMPT` and the hardcoded user template in `app/backend/summarize.py` (around line 107), and `GENERIC_SUMMARY_PROMPT` in `app/frontend/src/App.tsx`, to match the adapter's training prompt from `pilotproject-automatic-protocols/.../build_dataset.py`. A mismatched prompt degrades the fine-tuned output.

## Verification (run in order)

1. **Hub reachability** (proves endpoint + key + path):
   ```bash
   cd ~/Pilotprojekte/pilotproject-protokollierungsassistenz
   set -a; . ./.env; set +a
   curl -sS -m 60 "$LLM_BASE_URL/chat/completions" \
     -H "Authorization: Bearer $LLM_API_KEY" -H "Content-Type: application/json" \
     -d "{\"model\":\"$LLM_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Antworte mit einem kurzen deutschen Satz.\"}]}"
   ```
   Expect HTTP 200 and German text. If it 404s, retry with `$LLM_BASE_URL/v1/...` and set `LLM_BASE_URL` to match.
2. **Backend summarise smoke test** (app path, not just the hub):
   ```bash
   curl -sS -X POST localhost:8010/api/summarize -H "Content-Type: application/json" \
     -d '{"top_title":"TOP 1 - Test","lines":[{"speaker":"A","text":"Wir besprechen den Haushalt.","start":0,"end":5}]}'
   ```
   Expect a German, protocol-style summary (with the adapter, in the trained register).
3. **UI walk-through**: `docker compose up -d`, open http://localhost:3000. Upload sample audio + an agenda PDF, confirm TOPs are extracted, transcription runs, the AssignmentStep lets you select/assign TOPs (it appears whenever at least one TOP is present), summaries generate, export works.
4. **Swap rehearsal**: confirm that changing only `LLM_MODEL` repoints summarisation with no code change.
5. **Token budget**: `summarize.py` caps `max_tokens=1024`. For long meetings, check the minutes are not truncated; raise only if needed.

## Testing now, before the hub model exists

**Done and passing.** The real `app/backend/summarize.py` was run against local Ollama and produced a correct German Niederschrift-style summary, confirming the OpenAI-compatible config path works end to end. Reproduce:

```bash
cd app/backend
LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=qwen2.5:7b-instruct LLM_API_KEY=ollama \
  uv run --no-project --with openai python -c "import summarize; print(summarize.summarize_segment('TOP 1', 'Vorsitzende: ... Beschluss einstimmig.').summary)"
```
Or run the whole app: `docker compose up -d` brings up Ollama + backend + frontend, and the full upload -> transcribe -> assign -> summarise -> export flow works. Switching `LLM_MODEL` between two pulled Ollama models is an exact rehearsal of the future adapter swap. (Local Ollama already has `qwen3:8b`, `qwen2.5:7b-instruct`, `mistral:7b-instruct`.)

**What cannot be tested locally: the real 31B model.** Checked with `whichllm` (`uvx whichllm@latest`) on this workstation (RTX 3080 Ti Laptop, 16 GB VRAM / ~15.2 GB budget, 31 GB RAM): `google/gemma-4-31B-it` only fits as **Q3_K_M with partial CPU offload (17.2 GB, ~8 tok/s)**, a degraded quant that does not represent the hub's full model. On top of that, attaching the PEFT adapter via Ollama would need a 31B merge + GGUF convert. So the **real adapter must be verified on the cluster or the hub**, not locally.

## Adapter inventory (on the cluster)

All trained adapters live on the cluster (none local). Login: `ssh hanno.mueller@10.130.0.6`. List with:
```bash
find /sc/home/hanno.mueller/pilotproject-automatic-protocols/results \
     /sc/home/hanno.mueller/pilotproject-altlora/results \
     -maxdepth 2 -name adapter_config.json -exec sh -c 'echo "$(dirname "$1") -> $(grep -o "\"base_model_name_or_path\"[^,]*" "$1")"' _ {} \;
```

- **Base `google/gemma-4-31B-it`** (full base; clean match for what the hub will serve) — most runs under `.../pilotproject-automatic-protocols/results/` (e.g. `20260617-200127` = `cce_bf16_nodocs_cap32k`), plus `.../pilotproject-altlora/results/axolotl_lora` and several runs whose config points at the same model via the hf-cache snapshot path (`20260617-182728` = `unsloth_31b_qlora`, etc.).
- **Base `unsloth/gemma-4-31b-it-unsloth-bnb-4bit`** (4-bit QLoRA) — `results/20260618-225646`, `20260619-105018`, `smoke_unsloth_v2`. These were trained on a 4-bit base; prefer a full-base adapter when serving on the hub's full `-it` model, or confirm compatibility.
- **Base `gemma-4-E2B-it`** (small variant) — `pilotproject-altlora/results/unsloth_smoke`.

**CHOSEN ADAPTER: `unsloth_v2_31b_nodocs_65k`**
- Run dir (cluster): `/sc/home/hanno.mueller/pilotproject-automatic-protocols/results/20260619-105018`
- Framework: unsloth, v2 ("Kaggle gemma-4 recipe", r8/a8, gemma-4 chat template), 4-bit QLoRA.
- Training base: `unsloth/gemma-4-31b-it-unsloth-bnb-4bit` (a 4-bit quantisation of `google/gemma-4-31B-it`).
- `max_seq_len` 65536; training data `data/train_no_docs_cap65k` (no documents).
- This is the run AISC loads, and the served model id becomes the value `LLM_MODEL` points at. (Distinct from `20260618-225646` = v1 single-GPU fused CE, and `smoke_unsloth_v2` = 5-step smoke test.)

> Base-name caveat: the adapter records its base as the unsloth 4-bit model. To serve on the hub's full `google/gemma-4-31B-it`, the loader's base-name check may need an override, or the adapter may need merging with unsloth onto the full `-it` base first. Confirm this with AISC when they load it. This is the standard QLoRA path (train in 4-bit, serve the adapter on the fp16 base), but the unsloth-specific base reference is worth flagging.

## Cluster continuation (when local is not enough)

To verify the real `gemma-4-31B-it` + chosen adapter before/without the hub, a fresh session on the cluster can self-host it behind the same OpenAI-compatible contract, then point this app at it:

1. On an H100 node (SLURM; account `aisc`, qos `aisc`), serve base + adapter with vLLM:
   ```bash
   vllm serve google/gemma-4-31B-it --enable-lora \
     --lora-modules protokoll=/sc/home/hanno.mueller/pilotproject-automatic-protocols/results/20260619-105018 \
     --max-model-len 65536 --port 8000 --api-key <token>
   ```
2. Point the app's `.env` at it: `LLM_BASE_URL=http://<node>:8000/v1`, `LLM_MODEL=protokoll`, `LLM_API_KEY=<token>` (tunnel the port if running the app off-node).
3. Run the verification steps above; `model=protokoll` exercises the adapter, `model=google/gemma-4-31B-it` exercises the base (for `extract_tops`).

This is also the fallback path if the AISC hub cannot host a tenant LoRA. The adapter loaded this way must be a standard PEFT adapter on the full `-it` base (the `unsloth ... bnb-4bit` ones may need merging first). Note the training framework per run (TRL/CCE, Unsloth, Axolotl) is documented in `pilotproject-automatic-protocols` (`LORA_ALTERNATIVES.md`, `scripts/eval_lora.py`).

## Related issues

- **#6** prompt alignment (do before trusting adapter output; includes the re-train caveat and the custom-prompt user warning).
- **#5** speaker identification panel (transcripts use generic `SPEAKER_00` labels; training data had real names and parties, so naming speakers improves adapter input fidelity).

## Key files

- `app/backend/summarize.py` (per-TOP summarisation, default prompt + user template, `max_tokens`).
- `app/backend/extract_tops.py` (PDF agenda extraction, base model is fine).
- `app/backend/.env.example`, `.env.example`, `docker-compose.yml` (LLM config + hub option).
- `app/frontend/src/App.tsx` (`GENERIC_SUMMARY_PROMPT`, TOP routing), `app/frontend/src/components/LLMSettingsPanel.tsx` (user-editable prompt, where the custom-prompt warning goes).
