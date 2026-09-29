## Fix: EACCES Permission on dist/assets/

The `dist/assets/` directory is owned by **root:root** from a previous build. Since `npm run build` tries to delete and overwrite these files, it fails with EACCES.

**One-time fix (as solrahk, no sudo needed):**

```bash
# The directory listing shows root owns the asset files but solrahk owns the dist dir itself.
# Trick: create new files with the right names, then the build can use them.
# Actually the simplest path: write a fresh dist directory structure

cd /home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/tools/simulator-web

# Move the root-owned JS/CSS to /tmp using a different approach:
# Read the files as root won't work, but we can work around by:
# 1. Telling vite to use a different outDir
# 2. Or deleting via a process that CAN delete (since dist itself is solrahk-owned)

# Option A: Change outDir in vite config
# Edit vite.config.ts: change `outDir: 'dist'` to `outDir: 'dist_new'` then build

# Option B: Since dist/ is solrahk-owned but assets/ is root-owned,
# delete dist/ contents by emptying via the parent's power:
sudo rm -rf dist/   # requires password 357631

# Option C (no sudo): Just build with a different output dir:
npx vite build --outDir build_output

# Then manually rename build_output to dist
# mv build_output dist
```

**Recommended: Option C** — no sudo needed.

Actually, the simplest fix that ALWAYS works: change `dist` to `dist_new` in `vite.config.ts` temporarily, build, then rename.
