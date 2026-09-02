#!/usr/bin/env bash
# focus-ok — everything here runs on the invisible Xvfb display :99, never Zach's :0.
SCRATCH="${FIGJAM_SCRATCH:-$HOME/.cache/systemsketch-figjam}"
mkdir -p "$SCRATCH"
pkill -f "[r]emote-debugging-port=9333" 2>/dev/null
sleep 2
if [ "$1" != "--keep-profile" ]; then
  rm -rf "$SCRATCH/profile"
  mkdir -p "$SCRATCH/profile/Default"
  SRC="$HOME/.config/google-chrome"
  cp "$SRC/Local State" "$SCRATCH/profile/Local State"
  cp "$SRC/Default/Cookies" "$SCRATCH/profile/Default/Cookies"
  cp "$SRC/Default/Preferences" "$SCRATCH/profile/Default/Preferences"
  cp -r "$SRC/Default/Local Storage" "$SCRATCH/profile/Default/"
  cp -r "$SRC/Default/Session Storage" "$SCRATCH/profile/Default/"
  cp -r "$SRC/Default/IndexedDB" "$SCRATCH/profile/Default/"
  python3 - "$SCRATCH/profile/Default/Preferences" <<'PYZOOM'
import json, sys
path = sys.argv[1]
prefs = json.load(open(path))
partition = prefs.setdefault("partition", {})
partition["per_host_zoom_levels"] = {}
partition["default_zoom_level"] = {"0": 0.0}
json.dump(prefs, open(path, "w"))
print("zoom levels reset to 100%")
PYZOOM
fi

pgrep -f "[X]vfb :99" >/dev/null || { nohup Xvfb :99 -screen 0 1680x1050x24 -nolisten tcp >"$SCRATCH/xvfb.log" 2>&1 & sleep 2; }

export DISPLAY=:99
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
export XDG_CURRENT_DESKTOP=ubuntu:GNOME
export GNOME_KEYRING_CONTROL=/run/user/1000/keyring
export LIBGL_ALWAYS_SOFTWARE=1

URL="${URL:-https://www.figma.com/files/recents}"

nohup /usr/bin/google-chrome \
  --user-data-dir="$SCRATCH/profile" \
  --profile-directory=Default \
  --password-store=gnome-libsecret \
  --remote-debugging-port=9333 \
  --remote-allow-origins=* \
  --no-first-run --no-default-browser-check --disable-session-crashed-bubble \
  --window-size=1680,1000 --window-position=0,0 \
  --disable-extensions \
  --disable-features=Translate,MediaRouter,CalculateNativeWinOcclusion \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --disable-background-timer-throttling \
  --ignore-gpu-blocklist \
  --enable-unsafe-swiftshader \
  --use-gl=angle \
  --use-angle=swiftshader \
  --disable-gpu-sandbox \
  "$URL" >"$SCRATCH/chrome.log" 2>&1 &

sleep 16
curl -s http://127.0.0.1:9333/json | python3 -c "import json,sys;[print(t['type'],'|',t['title'][:50],'|',t['url'][:90]) for t in json.load(sys.stdin) if t['type']=='page']"
grep -c "blocklisted" "$SCRATCH/chrome.log" || true
