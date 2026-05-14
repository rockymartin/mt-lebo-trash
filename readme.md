# Mt. Lebanon Trash & Recycling Calendar

A modern web application that helps Mt. Lebanon, PA residents find their trash and recycling pickup schedule by street name. Features automatic calendar generation, holiday adjustments, recycling week tracking, and calendar export functionality.

🌐 **Live Site**: https://mtlebotrash.com

## Features

- 🔍 **Street Search**: Autocomplete search for Mt. Lebanon streets
- 📅 **Dynamic Calendar**: Generates personalized pickup calendars
- ♻️ **Recycling Schedule**: Every-other-week recycling pickup tracking
- 🎉 **Holiday Adjustments**: Automatic pickup day adjustments for holidays
- 📱 **Mobile Optimized**: Responsive design for all devices
- 📥 **Calendar Export**: Download .ics files for your calendar app
- 🖨️ **Print Friendly**: Clean print layout with B&W-friendly legend
- ♿ **Accessible**: Screen reader friendly with ARIA labels

## Technology Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Deployment**: Google Cloud Run with Nginx
- **Data**: CSV-based street schedule from Mt. Lebanon Public Works
- **SEO**: Optimized meta tags, structured data, sitemap

## Local Development

### Option 1: Python HTTP Server (Recommended)
```bash
npm run dev
# or
python3 -m http.server 8080 --directory site
```

### Option 2: Docker
```bash
docker build -t mt-lebo-trash:dev .
docker run --rm -p 8080:80 mt-lebo-trash:dev
```

### Option 3: Static Server
```bash
npx serve ./site
```

Then open http://localhost:8080 in your browser.

## Deployment to Google Cloud Run

### Prerequisites
- Google Cloud CLI installed and authenticated
- Docker installed
- Project with Cloud Run API enabled

### Setup
1. Set environment variables:
```bash
export GCP_PROJECT_ID="your-project-id"
export GCP_REGION="us-east1"
```

2. One-time setup (enable APIs, create Artifact Registry):
```bash
./scripts/gcp-setup.sh
```

3. Deploy:
```bash
./scripts/deploy-cloud-run.sh
```

### Continuous deployment (GitHub Actions)

Pushes to **`main`** run [`.github/workflows/deploy-cloud-run.yml`](.github/workflows/deploy-cloud-run.yml): Cloud Build produces the image (same as the script above), then Cloud Run is updated.

**Repository Variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Example |
|----------|---------|
| `GCP_PROJECT_ID` | Your GCP project ID |
| `GCP_REGION` | `us-east1` |

**Repository Secrets:**

| Secret | Value |
|--------|--------|
| `GCP_SA_JSON` | Paste the **full contents** of a GCP service account key JSON file (single-line or multiline is fine). |

**Create the key (once):**

1. In GCP: **IAM & Admin → Service Accounts** → create or pick a deployer account (e.g. `github-actions-deploy`).
2. Grant it at least:
   - **Cloud Build Editor** (`roles/cloudbuild.builds.editor`) — or broader Editor on tiny projects  
   - **Cloud Run Admin** (`roles/run.admin`)  
   - **Service Account User** (`roles/iam.serviceAccountUser`)  
   - **`roles/storage.admin`** (or narrower storage roles) if pushes to **`gcr.io`** fail — Cloud Build artifact upload often needs this  
3. **Keys → Add key → JSON**, download locally, copy the entire file into the **`GCP_SA_JSON`** secret in GitHub. **Do not commit the JSON file** to git.

Treat **`GCP_SA_JSON` like a password**: rotate or delete the key if it leaks; prefer a dedicated SA with only deploy/build roles.

**Difficulty:** About **10 minutes** (SA + IAM + one GitHub secret). Merges to `main` deploy automatically after that.

For OIDC without JSON keys (Workload Identity Federation), see [google-github-actions/auth](https://github.com/google-github-actions/auth).

**Cost (typical):**

| Piece | Rough notes |
|-------|----------------|
| **GitHub Actions** | Uses a few CPU-minutes per deploy on hosted runners; within normal free allowances for many repos. |
| **Cloud Build** | Minutes accumulate per build; GCP includes a monthly free tier — small nginx builds usually stay low. |
| **Cloud Run** | Static nginx service with low traffic is typically **cents/month** on scale-to-zero–friendly settings; you already pay when deploying manually today. |

## Data Source

Street schedule data is sourced from the official [Mt. Lebanon Public Works garbage collection page](https://mtlebanon.org/residents/public-works/garbage/).

## License

MIT License - see LICENSE file for details.

## Disclaimer

This tool is not affiliated with Mt. Lebanon Municipality. All information is sourced from publicly available data and should be verified with official sources.
