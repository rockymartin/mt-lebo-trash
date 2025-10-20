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

## Data Source

Street schedule data is sourced from the official [Mt. Lebanon Public Works garbage collection page](https://mtlebanon.org/residents/public-works/garbage/).

## License

MIT License - see LICENSE file for details.

## Disclaimer

This tool is not affiliated with Mt. Lebanon Municipality. All information is sourced from publicly available data and should be verified with official sources.
