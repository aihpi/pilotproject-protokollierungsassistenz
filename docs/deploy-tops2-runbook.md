# Runbook: serve the LoRA adapter and deploy tops2

Steps you run yourself (cluster, ArgoCD, DNS). Claude authored the manifests under `k8s-tops2/`
but holds no credentials. Issue #9 tracks this.

Chosen adapter: `~/pilotproject-automatic-protocols/results/20260622-202658`
(unsloth QLoRA, r=32, best eval_loss **0.7369** — lowest of yesterday's sweep).
Served name: **`gemma-4-31b-protokoll`**.

---

## Phase 1 — serve the LoRA adapter

The hub's `gemma-4-31b` is already LoRA-enabled (`--enable-lora`, max-loras **2**, rank ≤ 64)
and `lora-manager` allows `gemma-4-31b` as a base. Serving = one HTTP upload; no kubectl/ArgoCD.

Run on the cluster login node (`ssh hanno.mueller@10.130.0.6`; it can reach api.aisc.hpi.de):

```bash
export LITELLM_KEY="sk-..."   # your normal LiteLLM inference key

# 0. Check the 2-slot limit and what is already loaded on gemma-4-31b.
curl -sS https://api.aisc.hpi.de/v1/lora/adapters \
  -H "Authorization: Bearer $LITELLM_KEY" | jq
#    If gemma-4-31b already has 2 adapters, ask ops to free a slot before uploading.

# 1. Copy the run so the original training output is untouched.
cp -r ~/pilotproject-automatic-protocols/results/20260622-202658 /tmp/gemma-lora
cd /tmp/gemma-lora

# 2. Make the recorded base match the hub's full base (this run records the unsloth
#    4-bit base; the hub serves google/gemma-4-31B-it). Standard QLoRA-serve fix.
sed -i 's#"base_model_name_or_path": "[^"]*"#"base_model_name_or_path": "google/gemma-4-31B-it"#' adapter_config.json
grep base_model_name_or_path adapter_config.json   # confirm

# 3. Tar the CONTENTS (flat), only allowlisted files. Exclude chat_template.jinja,
#    *.bin, optimizer/scheduler, checkpoints/, runs/.
tar czf /tmp/gemma-4-31b-protokoll.tar.gz \
  adapter_config.json adapter_model.safetensors \
  tokenizer.json tokenizer_config.json special_tokens_map.json
tar tzf /tmp/gemma-4-31b-protokoll.tar.gz   # no leading "./", no extra files
ls -lh /tmp/gemma-4-31b-protokoll.tar.gz    # < 4 GiB (~0.25 GB here)

# 4. Upload.
curl -sS -X POST https://api.aisc.hpi.de/v1/lora/upload \
  -H "Authorization: Bearer $LITELLM_KEY" \
  -F "name=gemma-4-31b-protokoll" \
  -F "base_model=gemma-4-31b" \
  -F "adapter=@/tmp/gemma-4-31b-protokoll.tar.gz"
#    Expect 200 with "vllm_loaded": true, "litellm_registered": true.

# 5. Smoke test.
curl -sS https://api.aisc.hpi.de/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_KEY" -H "Content-Type: application/json" \
  -d '{"model":"gemma-4-31b-protokoll","messages":[{"role":"user","content":"Antworte mit einem kurzen deutschen Satz."}]}'
```

If step 4 returns `500 vllm load failed` despite the base edit, the QLoRA adapter is not
serving cleanly on the fp16 base. Fall back to a full-base run, e.g.
`~/pilotproject-automatic-protocols/results/20260619-093255` (r16, base
`google/gemma-4-31B-it`) — skip step 2 for it — and re-upload under the same name.

---

## Phase 2 — manifests (already done, in this repo)

`k8s-tops2/` is authored and on branch `9-deploy-tops2-gemma-lora`. Push it so ArgoCD can read
it:

```bash
cd ~/pilotproject-protokollierungsassistenz   # adjust to your checkout
git add k8s-tops2 docs/deploy-tops2-runbook.md
git commit -m "Add tops2 (gemma + LoRA) deployment manifests"
git push -u origin 9-deploy-tops2-gemma-lora
```

(Do not stage the unrelated working-tree edits to `k8s/*` and `docker-compose.yml`.)

---

## Phase 3 — deploy tops2

### 3a. Secret (namespace tops2)

The tops SealedSecret cannot be reused (sealed per namespace+name). Pick one:

```bash
# Quick (you have cluster access):
kubectl create namespace tops2
kubectl create secret generic tops2-secret -n tops2 \
  --from-literal=LLM_API_KEY="sk-...your-litellm-key..."

# OR GitOps: seal it, commit secrets/sealed-secret.yaml, uncomment it in kustomization.yaml:
kubectl create secret generic tops2-secret -n tops2 \
  --from-literal=LLM_API_KEY="sk-..." --dry-run=client -o yaml \
  | kubeseal --format yaml > k8s-tops2/secrets/sealed-secret.yaml
```

### 3b. New ArgoCD Application (UI at http://10.127.129.4)

First open the existing `tops` app and note its **repo URL, path, and targetRevision** — make
sure the new app does not overlap them (different path `k8s-tops2`, different namespace `tops2`).

Create app `tops2`:

| Field | Value |
|---|---|
| Repository URL | this repo |
| Revision | `9-deploy-tops2-gemma-lora` (or `main` once merged) |
| Path | `k8s-tops2` |
| Cluster | in-cluster (same as tops) |
| Namespace | `tops2` |
| Sync options | Auto-Create Namespace = true |
| Sync policy | Automatic (optional) |

Sync. `tops2-backend` pulls the A30 and loads WhisperX (3–5 min on first start).

### 3c. DNS

```bash
kubectl get svc -n tops2 tops2-frontend    # note EXTERNAL-IP
```

Request a DNS record `tops2.aisc.hpi.de` → that external IP (same as how tops.aisc.hpi.de is
wired; there is no Ingress, the frontend is a LoadBalancer).

---

## Verify

```bash
kubectl get pods -n tops2                                   # both Ready
curl -s https://tops2.aisc.hpi.de/api/llm-configs | jq      # default_id=gemma, gemma.model=gemma-4-31b-protokoll
# Then in the UI: upload audio + agenda PDF -> extract TOPs -> transcribe -> summarise -> export.
# Summaries should come back in the trained German protocol register.
```

Confirm tops is untouched: its ArgoCD app still Synced/Healthy, namespace `tops` unchanged.

---

## Follow-up (#6)

`prompt_gemma.txt` in the deployed image is still the provisional stand-in. The adapter's real
per-TOP training prompt (sha256 `46aa5c0b0587`) is in
`~/pilotproject-automatic-protocols/results/20260622-202658/train_log.md`. Aligning the prompt
and rebuilding the image is tracked in #6; until then, summary quality will not fully match the
fine-tuning.
