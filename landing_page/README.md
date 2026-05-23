# HUSH HOG / Pig Health Monitor — Research Landing

Static marketing site (3D chip tour, sensory architecture, citations). **Not** the Expo dashboard.

| Surface | URL |
|--------|-----|
| **This landing** | https://pig-health-research-portfolio.vercel.app |
| **Live app (Expo web)** | https://pig-health-monitor.vercel.app |
| Legacy app alias | https://pig-health-monitor.vercel.app (same Expo build) |

## Config

Edit `config.js` only for URL/version changes. `bootstrap.js` applies values on load.

## Deploy

```bash
./scripts/deploy-landing.sh
```

## Local preview

```bash
cd landing_page && npx serve -l 3456 .
# open http://localhost:3456
```
