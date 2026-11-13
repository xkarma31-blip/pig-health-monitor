# Pi-hosted local PigPulse app implementation plan

**Goal:** QR → Pi welcome page → optional venue Wi-Fi or Skip → full local Expo app.

**Architecture:** keep the existing :80 stdlib portal; serve the existing Expo
single-page export under `/app/` and provide same-origin read-only adapters for
the app's `/api/telemetry` and `/api/pi` contracts. All upstream destinations
are fixed Pi-local services. No Node process on the Pi, no cloud dependency,
no new packages. Internet-offline means the phone stays joined to PigPulse;
it does not mean disconnected from the Pi.

## 1. Regression tests before implementation
- Add HTTP integration checks to `test_portal.py`: static app + deep routes,
  missing assets, encoded traversal, collection/endpoint allowlists, local
  telemetry payload, honest cloud-advisor unavailability.
- Run tests red before adding `local_app.py` and wiring portal routes.

## 2. Minimal same-origin serving
- Create `local_app.py` beside `portal.py`: static file resolution contained in
  the export root; MIME types; fixed read-only local upstreams; no redirects,
  arbitrary host parameters or secret-bearing files.
- Modify portal routes to serve `/app/`, telemetry, and Pi reads. Keep all
  existing subnet checks. Cloud advisor returns an explicit offline message.
- Run HTTP tests and all existing portal regressions.

## 3. Unified welcome flow
- Preserve portal typography/contrast/buttons. Add primary full-app tile.
- Skip navigates to `/app/`; successful Wi-Fi does the same; failed connection
  stays on onboarding with Skip available. Extend result deadline to cover the
  measured 90-second failure plus restoration.
- Keep diagnostic dashboard links secondary and hosted site optional.

## 4. Export, backup, deploy
- Export on laptop with dotenv disabled (no public admin credentials baked in).
- Verify local asset paths, scan output for secret literals without printing
  them. Install exported files and helper through backed-up, versioned staging;
  restart portal only. Leave AP/radio/thermal/PocketBase untouched.
- Update installer and operator docs for repeatable deployment and rollback.

## 5. Verify and produce QR
- Browser: actual Pi welcome → Skip → app; reload a deep route; local telemetry
  and Pi reads; no internet resources required. Test Wi-Fi success navigation
  without unnecessary repeat radio interruption (mock browser result only;
  earlier real venue association tests already measured).
- Generate QR for `http://192.168.69.1/?setup=1` with an existing local QR tool.
- Record exact limits: full internet-offline local app, not a disconnected PWA;
  advanced audio may require trusted HTTPS; 5 GHz still requires second radio.
- Run syntax, regression, typecheck, build checks and critic; CodeRabbit may be
  blocked by login and must not hold the user's deliverable hostage.
