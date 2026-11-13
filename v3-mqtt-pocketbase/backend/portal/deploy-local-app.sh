#!/bin/bash
# Run on the Pi as root: bash deploy-local-app.sh /path/to/expo-export
# Copy this script and the portal source files together; export on the laptop.
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
src=$(cd "$(dirname "$0")" && pwd)
export_dir=${1:?Supply an Expo web export directory}
dest=/usr/local/lib/pigpulse-portal
stamp=$(date +%Y%m%d-%H%M%S)
backup=/root/pigpulse-backups/local-app-$stamp
release=$dest/releases/$stamp
[ "$(id -u)" = 0 ] || { echo 'Run on the Pi as root'; exit 1; }
[ -f "$export_dir/index.html" ] || { echo 'Missing exported index.html'; exit 1; }
python3 -m py_compile "$src/portal.py" "$src/local_app.py"
mkdir -p "$dest/releases"
mkdir -m 700 "$backup"
for name in portal.py portal.html local_app.py; do
  [ ! -e "$dest/$name" ] || cp -p "$dest/$name" "$backup/"
done
if [ -L "$dest/app" ]; then
  readlink "$dest/app" > "$backup/previous-app-link"
elif [ -e "$dest/app" ]; then
  echo 'Refusing to replace an unmanaged app directory'; exit 1
fi
mkdir "$release"
cp -a "$export_dir/." "$release/"
[ ! -f "$src/pigpulse-setup-qr.svg" ] || cp "$src/pigpulse-setup-qr.svg" "$release/"
chmod -R a+rX "$release"
install -m 755 "$src/portal.py" "$dest/portal.py"
install -m 644 "$src/local_app.py" "$dest/local_app.py"
install -m 644 "$src/portal.html" "$dest/portal.html"
ln -s "$release" "$dest/app-next"
mv -Tf "$dest/app-next" "$dest/app"
systemctl restart pigpulse-portal
systemctl is-active --quiet pigpulse-portal
curl -fsS --retry 5 --retry-connrefused --retry-delay 1 \
  http://127.0.0.1/app/ >/dev/null
echo "DEPLOYED=$release"
echo "BACKUP=$backup"
echo 'Rollback: restore portal.py/portal.html from BACKUP, restore previous-app-link if present, restart pigpulse-portal.'
