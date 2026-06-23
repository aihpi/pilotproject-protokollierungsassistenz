# tops2: Gemma-4-31b + LoRA instance

A second, parallel deployment of the Protokollierungsassistenz, served at
**https://tops2.aisc.hpi.de**, running the fine-tuned summarisation model (`gemma-4-31b` base +
the `gemma-4-31b-protokoll` LoRA adapter) on the AISC hub. It is fully independent of the
existing `tops` deployment (namespace `tops`, `llama-3-3-70b`), which is not modified.

This directory is a self-contained Kustomize package in its own namespace (`tops2`). It is a
sibling of `k8s/` (not nested inside it) so an ArgoCD application watching `k8s/` cannot pick it
up by accident. tops2 is deployed by its own ArgoCD Application (see below).

## What differs from `k8s/` (the tops deployment)

| | tops | tops2 |
|---|---|---|
| namespace | `tops` | `tops2` |
| default config | `standard` (llama) | `gemma` (`LLM_DEFAULT_CONFIG=gemma`) |
| summarisation model | `llama-3-3-70b` | `gemma-4-31b-protokoll` (LoRA adapter, via `GEMMA_MODEL`) |
| extract-tops / standard model | `llama-3-3-70b` | `gemma-4-31b` (base, via `LLM_MODEL`) |
| hostname | tops.aisc.hpi.de | tops2.aisc.hpi.de |

Everything else (WhisperX on a dedicated A30, image tags, probes) mirrors `k8s/`.

## Prerequisites

1. **The LoRA adapter must be served first.** Upload it to the hub's `gemma-4-31b` so it is
   callable as `gemma-4-31b-protokoll`. See `docs/deploy-tops2-runbook.md` (Phase 1).
2. **A LiteLLM `sk-...` key** with access to the adapter (the same key used for the upload).
3. **A free A30 GPU** on the cluster (tops already holds one).

## Deploy

1. Create the secret for namespace `tops2` (see `secrets/example-secret.yaml` for both the
   quick `kubectl` path and the GitOps `kubeseal` path).
2. Create a new ArgoCD Application pointing at this directory:
   - repo: this repository
   - targetRevision: `9-deploy-tops2-gemma-lora` (or `main` once merged)
   - path: `k8s-tops2`
   - destination namespace: `tops2`, auto-create namespace enabled
   - **Confirm the existing `tops` ArgoCD app's path/targetRevision first** so the new app does
     not overlap it.
3. After sync, get the LoadBalancer IP and request DNS `tops2.aisc.hpi.de` → that IP:
   ```bash
   kubectl get svc -n tops2 tops2-frontend
   ```

## Verify

```bash
kubectl get pods -n tops2                       # tops2-backend + tops2-frontend Ready
curl -s https://tops2.aisc.hpi.de/api/llm-configs | jq   # default_id=gemma, model=gemma-4-31b-protokoll
```

The full step-by-step runbook (adapter upload, secret, ArgoCD, DNS) is in
`docs/deploy-tops2-runbook.md`.
