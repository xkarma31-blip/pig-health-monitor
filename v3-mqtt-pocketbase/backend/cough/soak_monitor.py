import json, subprocess, time, sys

def get(url):
    try:
        return json.loads(subprocess.check_output(
            ["curl", "-sk", "--max-time", "8", url], timeout=12))
    except Exception as e:
        return {"_err": str(e)}

LOG = "/home/pigpulse/cough/soak.tsv"
MIN = int(sys.argv[1]) if len(sys.argv) > 1 else 8
print("t_s\tesp_Bps\tesp_pct\tscored\tdropped\tbusy\teofs\treconn\trss\tlat_ms\tverdict\twindows", flush=True)

t0 = time.time()
prev_bytes = None
prev_t = None
rows = []
while time.time() - t0 < MIN * 60:
    st = get("https://127.0.0.1:8080/cough/api/status")
    esp = get("https://127.0.0.1:8080/esp/status")
    now = time.time()
    b = esp.get("bytes")
    if prev_bytes is not None and b is not None:
        rate = (b - prev_bytes) / (now - prev_t)
    else:
        rate = 0.0
    prev_bytes, prev_t = b, now
    r = st.get("runtime", {}); a = st.get("aggregate", {})
    row = [round(now - t0, 1), round(rate), round(100.0 * rate / 192000, 1),
           r.get("windows_scored"), r.get("dropped_gappy"), r.get("skipped_busy"),
           r.get("upstream_eofs"), st.get("audio", {}).get("reconnects"),
           r.get("rss_mb"), a.get("infer_ms_median"), a.get("verdict"), a.get("windows")]
    rows.append(row)
    print("\t".join(str(x) for x in row), flush=True)
    time.sleep(10)

with open(LOG, "w") as f:
    f.write("t_s\tesp_Bps\tesp_pct\tscored\tdropped\tbusy\teofs\treconn\trss\tlat_ms\tverdict\twindows\n")
    for row in rows:
        f.write("\t".join(str(x) for x in row) + "\n")
print("WROTE", LOG, flush=True)
