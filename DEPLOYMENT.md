# 🚀 Deployment Guide — Youthnic Packing Station
## Google Cloud Run → consignment.youthnic.shop

---

## Architecture Overview

```
Internet
   │
   ▼
consignment.youthnic.shop  (Cloud Run custom domain)
   │
   ▼
Google Cloud Run  (asia-south1)
   │  Single container — Express serves:
   │    • React frontend (static files from /frontend/dist)
   │    • REST API (/api/*)
   │
   ▼
Firebase (Firestore + Storage)
   └── Auth: Application Default Credentials (ADC) — no JSON file needed
```

---

## Prerequisites

Install these on your machine:
```cmd
# Google Cloud SDK
https://cloud.google.com/sdk/docs/install

# Docker Desktop (for local testing)
https://www.docker.com/products/docker-desktop/

# Verify installs
gcloud --version
docker --version
```

---

## Step 1 — One-time GCP Setup

```cmd
# Log in and set your project
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

---

## Step 2 — Store Secrets in Secret Manager

Never put secrets in environment variables directly for production. Use Secret Manager:

```cmd
# Store JWT secret (generate a strong random one)
echo -n "your-very-long-random-jwt-secret-min-32-chars" | gcloud secrets create JWT_SECRET --data-file=-

# Store MailerSend API key
echo -n "your-mailersend-api-key" | gcloud secrets create MAILERSEND_API_KEY --data-file=-
```

---

## Step 3 — Grant Cloud Run Service Account Firebase Permissions

Cloud Run uses Application Default Credentials (ADC) — no JSON file needed.
Grant the Cloud Run default service account access to Firebase:

```cmd
# Get your project number
gcloud projects describe YOUR_GCP_PROJECT_ID --format="value(projectNumber)"

# Grant Firestore access (replace PROJECT_NUMBER)
gcloud projects add-iam-policy-binding YOUR_GCP_PROJECT_ID \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"

# Grant Firebase Storage access
gcloud projects add-iam-policy-binding YOUR_GCP_PROJECT_ID \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Grant Firebase Admin access
gcloud projects add-iam-policy-binding YOUR_GCP_PROJECT_ID \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/firebase.sdkAdminServiceAgent"

# Grant Secret Manager access
gcloud projects add-iam-policy-binding YOUR_GCP_PROJECT_ID \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Step 4 — Build & Push Docker Image

```cmd
cd C:\Users\shukl\Desktop\consignment-packing-master

# Build
docker build -t gcr.io/YOUR_GCP_PROJECT_ID/youthnic-packing:latest .

# Authenticate Docker with GCR
gcloud auth configure-docker

# Push
docker push gcr.io/YOUR_GCP_PROJECT_ID/youthnic-packing:latest
```

---

## Step 5 — Deploy to Cloud Run

```cmd
gcloud run deploy youthnic-packing ^
  --image=gcr.io/YOUR_GCP_PROJECT_ID/youthnic-packing:latest ^
  --platform=managed ^
  --region=asia-south1 ^
  --allow-unauthenticated ^
  --port=8080 ^
  --memory=1Gi ^
  --cpu=1 ^
  --concurrency=80 ^
  --timeout=300 ^
  --min-instances=0 ^
  --max-instances=10 ^
  --set-env-vars=NODE_ENV=production ^
  --set-env-vars=FIREBASE_PROJECT_ID=consignment-packing-app ^
  --set-env-vars=FIREBASE_STORAGE_BUCKET=consignment-packing-app.firebasestorage.app ^
  --set-env-vars=MAIL_FROM_EMAIL=consignment@youthnic.shop ^
  --set-env-vars=MAIL_FROM_NAME="Youthnic Packing Station" ^
  --set-env-vars=MAIL_USER_DOMAIN=youthnic.shop ^
  --set-env-vars=APP_URL=https://consignment.youthnic.shop ^
  --update-secrets=JWT_SECRET=JWT_SECRET:latest ^
  --update-secrets=MAILERSEND_API_KEY=MAILERSEND_API_KEY:latest
```

> Note: On Windows CMD use `^` for line continuation. On PowerShell use `` ` ``.

After deployment, note the Cloud Run URL: `https://youthnic-packing-XXXXXXXX-el.a.run.app`

---

## Step 6 — Map Custom Domain `consignment.youthnic.shop`

### 6a. Add domain to Cloud Run
```cmd
gcloud run domain-mappings create ^
  --service=youthnic-packing ^
  --domain=consignment.youthnic.shop ^
  --region=asia-south1
```

This will show you DNS records to add. Copy them.

### 6b. Add DNS records at your DNS provider (where youthnic.shop is managed)

Go to your DNS provider dashboard and add:

| Type  | Name              | Value                                      |
|-------|-------------------|--------------------------------------------|
| CNAME | consignment       | ghs.googlehosted.com.                      |

Or if it gives you an A record (IPv4):

| Type  | Name              | Value                                      |
|-------|-------------------|--------------------------------------------|
| A     | consignment       | (IP shown by gcloud command above)         |

> Wait 5–15 minutes for DNS to propagate.

### 6c. Verify mapping
```cmd
gcloud run domain-mappings describe ^
  --domain=consignment.youthnic.shop ^
  --region=asia-south1
```

Status should show `READY`. SSL certificate is provisioned automatically by Google.

---

## Step 7 — Set Up Firebase Storage CORS

Allow your custom domain to upload videos directly to Firebase Storage:

```cmd
# Install gsutil (comes with Google Cloud SDK)
gsutil cors set firebase-storage-cors.json gs://consignment-packing-app.firebasestorage.app

# Verify
gsutil cors get gs://consignment-packing-app.firebasestorage.app
```

---

## Step 8 — Update Firebase Authorized Domains

In Firebase Console → Authentication → Settings → Authorized domains:

Add: `consignment.youthnic.shop`

---

## Step 9 — Verify Everything Works

```cmd
# Health check
curl https://consignment.youthnic.shop/api/health

# Expected response:
# {"status":"ok","timestamp":"2025-..."}
```

Then open https://consignment.youthnic.shop in your browser and login.

---

## Step 10 — Set Up Auto-Deploy with Cloud Build (Optional)

Connect your GitHub repo to Cloud Build for automatic deployments on push:

```cmd
# The cloudbuild.yaml file is already in the repo.
# Just connect Cloud Build to your GitHub repo in GCP Console:
# Cloud Build → Triggers → Connect Repository
```

---

## Environment Variables Reference

| Variable | Value in Production | Source |
|---|---|---|
| `NODE_ENV` | `production` | Cloud Run env var |
| `PORT` | `8080` | Cloud Run (auto-injected) |
| `FIREBASE_PROJECT_ID` | `consignment-packing-app` | Cloud Run env var |
| `FIREBASE_STORAGE_BUCKET` | `consignment-packing-app.firebasestorage.app` | Cloud Run env var |
| `JWT_SECRET` | (strong random string) | Secret Manager |
| `MAILERSEND_API_KEY` | (your API key) | Secret Manager |
| `MAIL_FROM_EMAIL` | `consignment@youthnic.shop` | Cloud Run env var |
| `APP_URL` | `https://consignment.youthnic.shop` | Cloud Run env var |
| `ALLOWED_ORIGINS` | not needed (same-origin) | — |

> **Note:** `GOOGLE_APPLICATION_CREDENTIALS` is NOT needed on Cloud Run.  
> The backend automatically uses Application Default Credentials (ADC).

---

## Pre-Deployment Checklist

- [ ] `docker build -t test .` succeeds locally
- [ ] `gcloud auth login` done
- [ ] GCP project set correctly
- [ ] Firebase project has Firestore enabled (Native mode)
- [ ] Firebase project has Storage enabled
- [ ] JWT_SECRET stored in Secret Manager
- [ ] MAILERSEND_API_KEY stored in Secret Manager
- [ ] Cloud Run service account has IAM roles (Step 3)
- [ ] Domain `consignment.youthnic.shop` DNS configured
- [ ] Firebase Authorized Domains includes `consignment.youthnic.shop`
- [ ] Firebase Storage CORS set (Step 7)
- [ ] `/api/health` returns 200 after deploy

---

## Updating the App After Changes

```cmd
# Rebuild and redeploy (run from project root)
docker build -t gcr.io/YOUR_GCP_PROJECT_ID/youthnic-packing:latest . && ^
docker push gcr.io/YOUR_GCP_PROJECT_ID/youthnic-packing:latest && ^
gcloud run deploy youthnic-packing ^
  --image=gcr.io/YOUR_GCP_PROJECT_ID/youthnic-packing:latest ^
  --region=asia-south1
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `[Firebase] No valid credentials` | Cloud Run service account missing IAM roles (Step 3) |
| CORS errors in browser | Verify `ALLOWED_ORIGINS` or same-origin setup |
| Videos won't upload | Run Firebase Storage CORS setup (Step 7) |
| Domain shows 404 | Wait for DNS propagation (up to 30 min) |
| Domain shows "no SSL" | Wait for Google to provision cert (up to 24h) |
| `Secret not found` | Check secret names match exactly in Step 2 |
| Container crash on start | Check Cloud Run logs: `gcloud run services logs read youthnic-packing --region=asia-south1` |

---

## View Logs

```cmd
# Live logs
gcloud run services logs tail youthnic-packing --region=asia-south1

# Last 100 lines
gcloud run services logs read youthnic-packing --region=asia-south1 --limit=100
```
