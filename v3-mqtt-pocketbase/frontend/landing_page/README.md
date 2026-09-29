# PigPulse / Pig Health Monitor — Landing + Web App Deployment

Static marketing site (3D chip tour, sensory architecture, citations) with the Expo dashboard mounted below `/app` in the combined production deployment.

| Surface | URL |
|--------|-----|
| **Canonical landing** | https://pig-health-monitor.vercel.app/ |
| **Live app shell** | https://pig-health-monitor.vercel.app/app/ |
| **Live dashboard** | https://pig-health-monitor.vercel.app/app/tabs |
| Portfolio alias | https://pig-health-research-portfolio.vercel.app/ |

## Config

Edit `config.js` only for URL/version changes. `bootstrap.js` applies values on load.

## Deploy

```bash
./scripts/deploy-landing.sh
```

The production deployment keeps this landing page at `/` and stages the current Expo web export below `app/`. Do not deploy the Expo app over the domain root.

## Local preview

```bash
cd landing_page && npx serve -l 3456 .
# open http://localhost:3456
```

For the combined local preview, serve the landing page and Expo export separately, then use the local dashboard route configured in `config.js`.
