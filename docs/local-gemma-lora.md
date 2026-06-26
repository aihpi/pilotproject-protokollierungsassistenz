# Local Gemma serving (base + LoRA adapter)

How to run the `gemma` (Landtagstil) configuration locally with Ollama on a
limited-VRAM machine. The `standard` configuration stays on `qwen3:8b`.

> **Status: the 12b LoRA adapter is not yet available.** The base-model setup
> below works today. The LoRA sections (conversion, Modelfile `ADAPTER`,
> `gemma-4-12b-protokoll`) are **written but UNTESTED**; verify them once the
> adapter is published from `pilotproject-automatic-protocols`.

## Base model (works now)

Local `gemma` points at the base **`gemma4:12b`** (Ollama's instruction-tuned
tag, equivalent to `google/gemma-4-12B-it`, the adapter's training base).

```bash
ollama pull gemma4:12b
# backend reads GEMMA_MODEL; docker-compose + .env.example already default to gemma4:12b
GEMMA_MODEL=gemma4:12b   # standard stays qwen3:8b
```

> **Ollama version:** `gemma4` requires a recent Ollama. Older builds (e.g.
> 0.11.6) reject the pull with an "update Ollama" message. Upgrade with
> `curl -fsSL https://ollama.com/install.sh | sh` (needs sudo) if `ollama pull
> gemma4:12b` fails.

In docker the bundled Ollama pulls `gemma4:12b` automatically (see
`scripts/ollama-entrypoint.sh`, which pulls `OLLAMA_MODEL` + `GEMMA_MODEL`).

> **Known limitation of the bare base stand-in:** `gemma4:12b` is a *reasoning*
> model. Over Ollama's OpenAI-compatible `/v1` endpoint (which the backend uses)
> it spends the token budget on its `reasoning` field and returns an empty
> `content`, so the `gemma` config yields an **empty summary** until the adapter
> lands. Ollama's native `/api/chat` honours `think:false` (and then answers
> directly), but `/v1` ignores it, and the backend must stay OpenAI-compatible for
> the hub, so we do not special-case it. The fine-tuned `gemma-4-12b-protokoll`
> adapter is trained to emit the protocol directly (no reasoning), which resolves
> this. The base stand-in is only for exercising the config switch, not output
> quality. When the adapter lands, verify it emits non-empty `content` over `/v1`.

## Feasibility (whichllm, RTX 3080 Ti Laptop, 16 GB)

Checked with [whichllm](https://github.com/Andyyyy64/whichllm):

```bash
uvx whichllm@latest --gpu-only --speed usable --vram-headroom 1GB
```

On 16 GB (15 GB budget) whichllm ranks ~26–27B models as full-GPU fits at Q3_K_M
(`google/gemma-4-26B-A4B-it` ~12.3 GB, `google/gemma-3-27b-it` ~14.6 GB). A dense
**gemma-4-12b therefore fits comfortably at `Q4_K_M` (~7–8 GB)** with room for the
KV cache, and at `Q5_K_M`/`Q6` on machines with a little more headroom.

- `Q4_K_M` 12B (~7–8 GB): fits 16 GB. **Recommended local quant.**
- bf16 12B (~24 GB): does **not** fit 16 GB.
- Local **vLLM fp16** 12B: not viable on 16 GB; use it only on larger GPUs. Ollama
  (quantised GGUF) is the recommended local path.

## Serving the LoRA adapter locally (UNTESTED, pending adapter)

The adapter is trained on the bf16 base `google/gemma-4-12B-it`. Two paths to run
it under a quantised local model:

### Path 1 — merge then quantise (recommended for <= 16 GB)

Merge the adapter into the bf16 base, then quantise the merged model to GGUF. The
adapter's bf16 deltas are baked in before quantisation, so there is no
train/serve base mismatch.

```bash
# 1. merge (PEFT), e.g. with the training repo's merge util or peft:
#    model = PeftModel.from_pretrained(base_bf16, adapter_dir).merge_and_unload()
#    model.save_pretrained(merged_dir)
# 2. convert merged HF model -> GGUF and quantise to Q4_K_M (llama.cpp):
python llama.cpp/convert_hf_to_gguf.py merged_dir --outfile gemma-4-12b-protokoll-f16.gguf
./llama.cpp/llama-quantize gemma-4-12b-protokoll-f16.gguf gemma-4-12b-protokoll-Q4_K_M.gguf Q4_K_M
# 3. register in Ollama:
printf 'FROM ./gemma-4-12b-protokoll-Q4_K_M.gguf\n' > Modelfile
ollama create gemma-4-12b-protokoll -f Modelfile
# 4. point the gemma config at it:
GEMMA_MODEL=gemma-4-12b-protokoll
```

### Path 2 — runtime adapter over the quantised base

Smaller artifact (ship only the adapter), but the adapter was trained against
bf16 weights while inference runs on Q4, so expect a small quality loss. Needs an
Ollama/llama.cpp build with gemma-4 adapter support.

```bash
# convert the PEFT adapter to a GGUF adapter (kept f16):
python llama.cpp/convert_lora_to_gguf.py adapter_dir --base gemma4:12b \
  --outfile gemma-4-12b-protokoll-adapter.gguf
# Modelfile applying it on the base (see Modelfile.gemma-lora template):
ollama create gemma-4-12b-protokoll -f docs/Modelfile.gemma-lora
GEMMA_MODEL=gemma-4-12b-protokoll
```

### Alternative — local vLLM (no conversion, needs more VRAM)

```bash
vllm serve google/gemma-4-12B-it --enable-lora \
  --lora-modules protokoll=/path/to/peft_adapter --max-model-len 65536 \
  --port 8000 --api-key local
# then: LLM_BASE_URL=http://localhost:8000/v1  GEMMA_MODEL=protokoll
```

Base-match caveat: the adapter must be served on the same base family it was
trained on (`google/gemma-4-12B-it`). Serving on a different base degrades output.

## Prompt

The `gemma` config prompt is locked to the adapter's training prompt
(`app/backend/prompt_gemma.txt`, pinned, see issue #6). It is shared and stable
across base sizes; do not edit it for the 12b adapter unless retrained.
