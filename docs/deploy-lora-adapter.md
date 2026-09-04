# Replacing the Landtagstil LoRA adapter

The "Landtagstil" configuration (`id="gemma"` in `app/backend/llm_config.py`) sends its requests to the model named by `GEMMA_MODEL`. In production that is `gemma-4-31b-protokoll`, a LoRA adapter for `gemma-4-31b` served by the LiteLLM hub at `https://api.aisc.hpi.de`. This page describes how a newly trained adapter replaces it. The training side (data, hyperparameters, run folders) lives in [pilotproject-automatic-protocols](https://github.com/aihpi/pilotproject-automatic-protocols).

## What the hub accepts

The hub's adapter API is documented in `aihpi/litellm-k8s/docs/uploading-loras.md`. The points that matter here:

- Endpoints: `GET /v1/lora/adapters` (inventory), `POST /v1/lora/upload` (multipart fields `name`, `base_model`, `adapter`), `POST /v1/lora/delete` (fields `name`, `base_model`). All need a LiteLLM key with `/v1/lora/*` rights; delete works only for the key that uploaded the adapter.
- Names match `^[a-z0-9][a-z0-9-]{0,62}$`. Uploading an existing name returns 409. At most two adapters per base model, LoRA rank at most 64.
- The tarball is flat (no directory prefix) and may contain only `adapter_config.json`, `adapter_model.safetensors`, `tokenizer.json`, `tokenizer_config.json`, `special_tokens_map.json`, `added_tokens.json` and `README.md`. `chat_template.jinja`, `processor_config.json`, checkpoints and `.bin` files are rejected.
- The hub serves the fp16 base `google/gemma-4-31B-it`. Adapters trained with Unsloth's 4-bit base record `unsloth/gemma-4-31b-it-unsloth-bnb-4bit` in `adapter_config.json`; patch `base_model_name_or_path` to `google/gemma-4-31B-it` before uploading.

## Staging a run

From a run folder of the training repository:

```
STAGE=$(mktemp -d)
for f in adapter_config.json adapter_model.safetensors tokenizer.json tokenizer_config.json README.md; do cp results/<run>/$f $STAGE/; done
sed -i 's#"base_model_name_or_path": "[^"]*"#"base_model_name_or_path": "google/gemma-4-31B-it"#' $STAGE/adapter_config.json
tar czf gemma-4-31b-protokoll.tar.gz -C $STAGE .
tar tzf gemma-4-31b-protokoll.tar.gz
```

Record the safetensors checksum (`sha256sum`) next to the tarball.

## Replacing the adapter without a 409

The production name is fixed by the ConfigMap, so the new adapter has to take over the same name. Validate it first on the free slot, then swap:

1. `GET /v1/lora/adapters`: confirm one free slot under `gemma-4-31b`.
2. Upload the tarball as a temporary name, for example `gemma-4-31b-protokoll-next`. Expect `"vllm_loaded": true` and `"litellm_registered": true`. A `500 vllm load failed` means the adapter does not serve on the fp16 base; stop, nothing has changed for users.
3. Send one real per-TOP request to the temporary name (same `messages` shape as `app/backend/summarize.py`: the system prompt from `prompt_gemma.txt`, the user turn `Erstelle eine Zusammenfassung ... TOP N: <title> ... Transkript: ... Zusammenfassung:`). Expect German protocol prose starting with `## Zu TOP N:`.
4. `POST /v1/lora/delete` the production name. Landtagstil is unavailable from here until step 5.
5. Upload the same tarball under the production name.
6. Smoke-test the production name, then delete the temporary name.
7. `GET /v1/lora/adapters`: exactly one protokoll adapter, owned by you.

```
export KEY=<your key>; export HUB=https://api.aisc.hpi.de
curl -s -H "Authorization: Bearer $KEY" $HUB/v1/lora/adapters | python3 -m json.tool
curl -s -X POST -H "Authorization: Bearer $KEY" -F name=gemma-4-31b-protokoll-next -F base_model=gemma-4-31b -F adapter=@gemma-4-31b-protokoll.tar.gz $HUB/v1/lora/upload
curl -s -X POST -H "Authorization: Bearer $KEY" -F name=gemma-4-31b-protokoll -F base_model=gemma-4-31b $HUB/v1/lora/delete
curl -s -X POST -H "Authorization: Bearer $KEY" -F name=gemma-4-31b-protokoll -F base_model=gemma-4-31b -F adapter=@gemma-4-31b-protokoll.tar.gz $HUB/v1/lora/upload
curl -s -X POST -H "Authorization: Bearer $KEY" -F name=gemma-4-31b-protokoll-next -F base_model=gemma-4-31b $HUB/v1/lora/delete
```

Known hub failure: an upload that returns `401` mentioning `/model/new` means the lora-manager holds a stale LiteLLM master key. `kubectl rollout restart deployment/lora-manager -n litellm` on the hub cluster (or a message to KISZ) fixes it; the name stays free, so the retry does not hit a 409.

## Making the app pick it up

Nothing changes in the app when the adapter is replaced under the same name; the backend resolves the model name per request. If the name changes, edit `GEMMA_MODEL` in `k8s/backend/configmap.yaml`, merge to `main` and let ArgoCD sync. A ConfigMap change does not restart the pod:

```
kubectl rollout restart deployment/tops-backend -n tops
kubectl rollout status deployment/tops-backend -n tops
curl -s -u <basic-auth> https://tops.aisc.hpi.de/api/llm-configs
```

The response must list `gemma` with the expected `model`. Then generate one Landtagstil summary in the UI.

## Prompt coupling

`prompt_gemma.txt` is the prompt the adapter was trained on (`scripts/utils/prompt_summarize.txt` in the training repository). A retrained adapter with a different prompt needs both files changed together; the configuration is `prompt_editable=False` for that reason.

## History

- 2026-09-04: `gemma-4-31b-protokoll` replaced by the cap48k run (`results/20260902-31b_cap48k`, r8, sequence cap 49,152, validation loss 0.6927). The previous adapter (r32, cap 65,536, trained on 229 records) is kept in the training repository's `results/archive/20260622-202658-legacy` for rollback. The interim `tops2` deployment that first served the adapter was retired at the same time.
