# Continue the tops2 deploy from a local Linux machine

Pick up here once you are on your own Linux box (which has network access to the cluster). The
hard, novel parts are already done:

- **LoRA adapter is served**: `gemma-4-31b-protokoll` is live on the hub and answering (HTTP 200).
- **Manifests are committed + pushed**: branch `9-deploy-tops2-gemma-lora`, path `k8s-tops2`.
- The existing `tops` deployment (namespace `tops`, path `k8s` on `main`) is **not** touched.

What's left needs cluster access (kubectl): create the `tops2` secret, deploy the workloads,
wire DNS. Tell the admin you are on **Linux, not Mac** — they offered to send the kubeconfig.

---

## 0. Prerequisites

- Local Linux with network reach to the cluster API server.
- The admin sends you the kubeconfig file (ask after kubectl is installed).
- Your LiteLLM `sk-...` key (same one used for the adapter upload).

## 1. Install kubectl (Linux — not snap, not brew)

Distro-agnostic official binary:

```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
```
```bash
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && kubectl version --client
```

(Debian/Ubuntu apt or Fedora dnf repos also work; the binary above is the simplest.)

## 2. Install the kubeconfig the admin sends

```bash
mkdir -p ~/.kube && cp /path/to/admin-kubeconfig ~/.kube/config && chmod 600 ~/.kube/config
```

Test access (should list `tops` and `litellm`):

```bash
kubectl get ns | grep -E 'tops|litellm'
```

## 3. Create the tops2 secret (the one blocker)

```bash
kubectl create namespace tops2
```
```bash
kubectl create secret generic tops2-secret -n tops2 --from-literal=LLM_API_KEY="sk-...your-litellm-key..."
```
```bash
kubectl get secret tops2-secret -n tops2
```

Never commit this key. (SealedSecret is only needed if you want the secret in git, which you
don't here.)

## 4. Deploy the workloads — pick ONE

### Option A — direct kubectl apply (simplest; reads the manifests straight from the branch)

```bash
kubectl apply -k "https://github.com/aihpi/pilotproject-protokollierungsassistenz//k8s-tops2?ref=9-deploy-tops2-gemma-lora"
```

(Or clone and apply locally: `git clone https://github.com/aihpi/pilotproject-protokollierungsassistenz && cd pilotproject-protokollierungsassistenz && git checkout 9-deploy-tops2-gemma-lora && kubectl apply -k k8s-tops2`.)

### Option B — ArgoCD (GitOps, matches tops; you have ArgoCD admin)

The `tops` app is in **project `tops`**, which restricts destinations to namespace `tops`, so
first widen it: UI → Settings → Projects → `tops` → Destinations → add
`{ Server: https://kubernetes.default.svc, Namespace: tops2 }` (or use project `default`).
Then create a new Application: name `tops2`, repo
`https://github.com/aihpi/pilotproject-protokollierungsassistenz`, revision
`9-deploy-tops2-gemma-lora`, path `k8s-tops2`, destination in-cluster / namespace `tops2`,
tick Auto-Create Namespace, then Sync. (The secret from step 3 must exist first.)

## 5. Watch it come up

```bash
kubectl get pods -n tops2 -w
```

Frontend is quick; `tops2-backend` pulls an A30 and loads WhisperX (3-5 min). If it sticks:

```bash
kubectl describe pod -n tops2 -l app=tops2-backend
```

- `Pending` + `Insufficient nvidia.com/gpu` or node-selector events → no free A30.
- `CreateContainerConfigError` → the secret is missing/misnamed (redo step 3).

## 6. DNS

```bash
kubectl get svc -n tops2 tops2-frontend
```

Take the `EXTERNAL-IP` and request a DNS record `tops2.aisc.hpi.de` -> that IP (same as how
`tops.aisc.hpi.de` is wired; there is no Ingress, the frontend is a LoadBalancer).

## 7. Verify

```bash
kubectl get pods -n tops2
```
```bash
curl -s https://tops2.aisc.hpi.de/api/llm-configs | jq
```

`/api/llm-configs` should show `default_id: gemma` and the `gemma` config `model:
gemma-4-31b-protokoll`. Then do a UI end-to-end: upload audio + agenda PDF -> extract TOPs ->
transcribe -> summarise -> export.

Confirm `tops` is still Synced/Healthy and namespace `tops` is unchanged.

---

## Known follow-up (not blocking)

tops2 runs image `:6-llm-config-switching`, which still has the **provisional** summary prompt.
The #6-aligned prompt (committed on branch 9) only takes effect once an app image is built from
branch `9-deploy-tops2-gemma-lora` (commit `7a12cff`) and the image tags in
`k8s-tops2/backend/deployment.yaml` + `frontend/deployment.yaml` are bumped to it (CI builds
`sha-<commit>` tags, e.g. `sha-7a12cff[-gpu]`). Deploy now, bump later.
