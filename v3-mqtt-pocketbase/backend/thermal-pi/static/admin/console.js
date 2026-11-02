/* PigPulse technician console — shared renderer.
 *
 * Two rules that are load-bearing, not style:
 *
 *  1. `unavailable` NEVER renders as a number. A missing sensor shows
 *     NOT CONNECTED, because "0 C" and "no sensor" are different facts and
 *     collapsing them is the exact lie this console exists to prevent.
 *
 *  2. Untrusted text (source code, diagnostic evidence) is written with
 *     textContent, never innerHTML. The source view shows real files from
 *     disk; an innerHTML mistake there would execute whatever is on disk.
 */

"use strict";

const NAV = [
  ["index.html", "Overview"],
  ["sensors.html", "Sensors"],
  ["data.html", "Data"],
  ["system.html", "System"],
  ["code.html", "Code"],
  ["diagnostics.html", "Diagnostics"],
];

const NA = "NOT CONNECTED";

/** Provenance-aware value rendering. The core of the anti-mock rule. */
function renderVal(d) {
  if (d === null || d === undefined) return document.createTextNode("—");
  const tag = d.tag;
  if (tag === "unavailable" || d.value === null || d.value === undefined) {
    const s = document.createElement("span");
    s.className = "na";
    s.textContent = d.note ? `${NA} — ${d.note}` : NA;
    return s;
  }
  const frag = document.createDocumentFragment();
  if (typeof d.value === "object") {
    const pre = document.createElement("pre");
    pre.className = "evidence";
    pre.textContent = JSON.stringify(d.value, null, 2);
    frag.appendChild(pre);
  } else {
    const v = document.createElement("span");
    v.className = "mono";
    v.textContent = String(d.value);
    frag.appendChild(v);
  }
  const p = document.createElement("span");
  p.className = "tag-pill " + tag;
  p.textContent = " " + tag;
  p.title = d.source || "";
  frag.appendChild(p);
  return frag;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

async function api(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(path + " -> HTTP " + r.status);
  return r.json();
}

/** Banner: always state where the data came from. */
async function paintBanner() {
  const host = document.getElementById("banner");
  if (!host) return;
  let rt;
  try {
    rt = (await api("/admin/api/overview")).runtime;
  } catch (e) {
    host.className = "devbanner";
    host.textContent = "CONSOLE OFFLINE — " + e.message;
    return;
  }
  const env = rt.env.value;
  const live = env === "pi-live";
  host.className = "devbanner" + (live ? " live" : "");
  host.textContent = "";
  const tag = el("span", "tag", live ? "PI LIVE" : "DEV SNAPSHOT");
  host.appendChild(tag);
  host.appendChild(
    document.createTextNode(
      live
        ? "Data source: this Pi, read live."
        : "Data source: " + (rt.dev_source.value || "?") +
          " — an offline SD-card snapshot. Sensors are NOT connected; " +
          "no value on this page came from hardware."
    )
  );
  const envp = el("span", "tag-pill " + env, "");
  envp.textContent = " runtime.env=" + env;
  host.appendChild(envp);
}

function markNav() {
  const seg = location.pathname.split("/").pop();
  const here = (!seg || seg === "admin") ? "index.html" : seg;
  document.querySelectorAll("nav a").forEach((a) => {
    if (a.getAttribute("href").endsWith(here)) a.classList.add("on");
  });
}

async function boot() {
  markNav();
  await paintBanner();
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */
async function overview() {
  const box = document.getElementById("main");
  const o = await api("/admin/api/overview");

  const counts = o.severity_counts || {};
  const grid = el("div", "grid");
  for (const sev of ["high", "medium", "low", "info"]) {
    const c = el("div", "card");
    c.appendChild(el("div", "count-big", counts[sev] || 0));
    c.appendChild(el("div", null, sev.toUpperCase() + " findings"));
    grid.appendChild(c);
  }
  box.appendChild(grid);

  box.appendChild(el("h2", null, "Subsystem state"));
  const g2 = el("div", "grid");
  const names = { thermal: "MLX90640 thermal", esp: "ESP32-S3 barn mic", cctv: "Tapo CCTV" };
  for (const [k, label] of Object.entries(names)) {
    const c = el("div", "card");
    c.appendChild(el("h3", null, label));
    const dl = el("dl", "kv");
    const dt = el("dt", null, "State");
    const dd = el("dd");
    dd.appendChild(renderVal(o.sensors[k]));
    dl.append(dt, dd);
    c.appendChild(dl);
    g2.appendChild(c);
  }
  box.appendChild(g2);

  // Architecture & Component Deep-Dive Section
  if (o.architecture && o.architecture.parts) {
    box.appendChild(el("h2", null, "System Architecture & Hardware Breakdown (Click to Inspect)"));
    box.appendChild(el("p", "lead", "Interactive map of physical pins, protocols, wiring diagrams, software packages, and target code files."));

    const drawer = el("div", "detail-drawer");
    drawer.style.display = "none";
    box.appendChild(drawer);

    const partsGrid = el("div", "grid");
    for (const part of o.architecture.parts) {
      // Attach the live/snapshot sensor reading so the drawer can show real
      // state for hardware-backed parts, and nothing at all for the rest.
      if (part.status_key && o.sensors[part.status_key]) {
        part._sensor = o.sensors[part.status_key];
      }
      const pc = el("div", "card part-card");
      pc.appendChild(el("div", "part-badge", part.tier));
      pc.appendChild(el("h3", null, part.name));
      const desc = el("p", "muted", part.function);
      pc.appendChild(desc);

      const dl = el("dl", "kv");
      dl.appendChild(el("dt", null, "Protocol"));
      dl.appendChild(el("dd", "mono", part.protocol || "—"));
      dl.appendChild(el("dt", null, "Service / Unit"));
      dl.appendChild(el("dd", "mono", part.service || "—"));
      pc.appendChild(dl);

      pc.addEventListener("click", () => showPartDetail(part, drawer));
      partsGrid.appendChild(pc);
    }
    box.appendChild(partsGrid);

    // Architectural Decisions Section
    if (o.architecture.decisions && o.architecture.decisions.length) {
      box.appendChild(el("h2", null, "Architectural Decision Records (ADRs) & Trade-offs"));
      box.appendChild(el("p", "lead", "Rationales for why specific sensors, protocols, and database engines were chosen."));
      const decContainer = el("div", "dec-list");
      for (const d of o.architecture.decisions) {
        const item = el("div", "dec-item");
        item.appendChild(el("div", "dec-header", `#${d.num}. ${d.title}`));
        const body = el("div", null);
        body.appendChild(el("strong", null, "Decision: "));
        body.appendChild(document.createTextNode(d.decision));
        item.appendChild(body);
        const rat = el("div", "dec-rationale");
        rat.appendChild(el("strong", null, "Rationale: "));
        rat.appendChild(document.createTextNode(d.rationale));
        item.appendChild(rat);
        decContainer.appendChild(item);
      }
      box.appendChild(decContainer);
    }
  }

  box.appendChild(el("h2", null, "Most serious findings"));
  (o.top || []).forEach((f) => box.appendChild(findingNode(f)));
  const more = el("p");
  more.appendChild(el("a", null, "All findings →")).href = "diagnostics.html";
  box.appendChild(more);
}

/**
 * Render the deep-dive drawer for one architecture part.
 *
 * Untrusted strings (function text, pin notes, package names) go in via
 * textContent, never innerHTML — the same rule the source viewer follows.
 */
function showPartDetail(part, drawer) {
  drawer.textContent = "";

  const h = el("h3");
  h.appendChild(document.createTextNode(part.name));
  const close = el("button", "btn-close", "×");
  close.setAttribute("aria-label", "Close details");
  close.addEventListener("click", (ev) => {
    ev.stopPropagation();
    drawer.style.display = "none";
  });
  h.appendChild(close);
  drawer.appendChild(h);

  drawer.appendChild(el("span", "part-badge", part.tier));

  // Live status for this part, when the console has one.
  if (part.status_key && part._sensor) {
    const st = el("dl", "kv");
    st.appendChild(el("dt", null, "Live state"));
    const dd = el("dd");
    dd.appendChild(renderVal(part._sensor));
    st.appendChild(dd);
    drawer.appendChild(st);
  }

  const rows = [
    ["Function", part.function],
    ["Protocol / Bus", part.protocol],
    ["Hardware", part.hardware],
    ["Service / Unit", part.service],
    ["Data destination", part.data_destination],
  ];
  if (rows.some((r) => r[1])) {
    const dl = el("dl", "kv");
    for (const [k, v] of rows) {
      if (!v) continue;
      dl.appendChild(el("dt", null, k));
      dl.appendChild(el("dd", null, v));
    }
    drawer.appendChild(dl);
  }

  // Wiring table — the pin-by-pin connection map.
  if (part.wiring && part.wiring.length) {
    drawer.appendChild(el("h3", null, "Wiring / connection map"));
    const t = el("table", "wiring-table");
    const thead = el("thead");
    const hr = el("tr");
    ["Component pin", "Connects to", "Note"].forEach((h2) =>
      hr.appendChild(el("th", null, h2))
    );
    thead.appendChild(hr);
    t.appendChild(thead);
    const tb = el("tbody");
    for (const w of part.wiring) {
      const tr = el("tr");
      tr.appendChild(el("td", "mono", w.sensor_pin || "—"));
      tr.appendChild(el("td", "mono", w.pi_pin || "—"));
      tr.appendChild(el("td", "muted", w.note || ""));
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    drawer.appendChild(t);
  }

  // Required software packages.
  if (part.packages && part.packages.length) {
    drawer.appendChild(el("h3", null, "Required packages"));
    const ul = el("ul", "step-list");
    for (const p of part.packages) ul.appendChild(el("li", "mono", p));
    drawer.appendChild(ul);
  }

  // Setup process — numbered, runnable steps.
  if (part.setup_process && part.setup_process.length) {
    drawer.appendChild(el("h3", null, "Process to make it work"));
    const ol = el("ol", "step-list");
    for (const s of part.setup_process) {
      const li = el("li");
      const pre = el("pre", "evidence", s);
      li.appendChild(pre);
      ol.appendChild(li);
    }
    drawer.appendChild(ol);
  }

  // Deep link into the Code viewer for the implementing file.
  if (part.code_path) {
    const row = el("div", "row");
    const a = el("a", null, "Open " + part.code_path + " in the Code viewer →");
    a.href = "/admin/code.html?path=" + encodeURIComponent(part.code_path);
    row.appendChild(a);
    drawer.appendChild(row);
  }

  drawer.style.display = "block";
  drawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function findingNode(f) {
  const d = el("div", "finding " + (f.severity || "info"));
  const h = el("h3");
  h.appendChild(el("span", "sev " + (f.severity || "info"), f.severity || "info"));
  h.appendChild(document.createTextNode("  " + (f.title || "")));
  d.appendChild(h);

  for (const [label, val] of [
    ["evidence", f.evidence],
    ["why it matters", f.why],
    ["recommended fix", f.fix],
  ]) {
    if (!val) continue;
    const row = el("div", "row");
    row.appendChild(el("div", "lbl", label));
    const pre = el("pre", "evidence", val);
    row.appendChild(pre);
    d.appendChild(row);
  }
  if (f.command) {
    const row = el("div", "row");
    row.appendChild(el("div", "lbl", "command"));
    const pre = el("pre", "evidence", f.command);
    row.appendChild(pre);
    const b = el("button", "go", "Copy command");
    b.addEventListener("click", (ev) => {
      navigator.clipboard.writeText(f.command).then(
        () => { ev.currentTarget.textContent = "Copied"; },
        () => { ev.currentTarget.textContent = "Copy failed"; }
      );
    });
    row.appendChild(b);
    d.appendChild(row);
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* Sensors                                                             */
/* ------------------------------------------------------------------ */
async function sensors() {
  const box = document.getElementById("main");
  const s = (await api("/admin/api/full")).sensors;
  for (const [k, label] of Object.entries({
    thermal: "MLX90640 thermal (I2C)",
    esp: "ESP32-S3 barn mic (TCP :9090)",
    cctv: "Tapo CCTV (RTSP :554 → MJPEG :8091)",
  })) {
    box.appendChild(el("h2", null, label));
    const c = el("div", "card");
    const dl = el("dl", "kv");
    const dt = el("dt", null, "State");
    const dd = el("dd");
    dd.appendChild(renderVal(s[k]));
    dl.append(dt, dd);
    c.appendChild(dl);
    box.appendChild(c);
  }
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */
async function dataPage() {
  const box = document.getElementById("main");
  const pb = await api("/admin/api/pocketbase");

  box.appendChild(el("h2", null, "PocketBase"));
  const c = el("div", "card");
  const dl = el("dl", "kv");
  let d1 = el("dt", null, "Database"), d2 = el("dd");
  d2.appendChild(renderVal(pb.available));
  dl.append(d1, d2);
  d1 = el("dt", null, "Unsynced rows");
  d2 = el("dd");
  d2.appendChild(renderVal(pb.unsynced));
  dl.append(d1, d2);
  c.appendChild(dl);
  box.appendChild(c);

  box.appendChild(el("h2", null, "Row counts"));
  const t = el("table");
  t.innerHTML =
    "<thead><tr><th>Collection</th><th class='num'>Rows</th><th>Provenance</th><th>Source</th></tr></thead>";
  const tb = el("tbody");
  for (const [name, d] of Object.entries(pb.collections || {})) {
    const tr = el("tr");
    tr.appendChild(el("td", null, name));
    const n = el("td", "num");
    n.appendChild(renderVal(d));
    tr.appendChild(n);
    const p = el("td");
    p.appendChild(el("span", "tag-pill " + d.tag, d.tag));
    tr.appendChild(p);
    tr.appendChild(el("td", "mono", (d.source || "").split("/").slice(-3).join("/")));
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  box.appendChild(t);

  if ((pb.latest || []).length) {
    box.appendChild(el("h2", null, "Most recent telemetry"));
    const t2 = el("table");
    const cols = Object.keys(pb.latest[0]);
    const th = el("thead"), hr = el("tr");
    cols.forEach((k) => hr.appendChild(el("th", null, k)));
    th.appendChild(hr);
    t2.appendChild(th);
    const tb2 = el("tbody");
    for (const row of pb.latest) {
      const tr = el("tr");
      cols.forEach((k) => tr.appendChild(el("td", "mono", row[k])));
      tb2.appendChild(tr);
    }
    t2.appendChild(tb2);
    box.appendChild(t2);
  }

  const drift = await api("/admin/api/diagnostics");
  const sch = drift.filter((f) => f.id.startsWith("schema."));
  if (sch.length) {
    box.appendChild(el("h2", null, "Schema drift (published vs PocketBase)"));
    box.appendChild(
      el(
        "div",
        "note",
        "PocketBase drops unknown fields silently, so drift looks like " +
          "working telemetry with empty statistics."
      )
    );
    sch.forEach((f) => box.appendChild(findingNode(f)));
  }
}

/* ------------------------------------------------------------------ */
/* System                                                              */
/* ------------------------------------------------------------------ */
async function system() {
  const box = document.getElementById("main");
  const full = await api("/admin/api/full");
  const u = full.units, n = full.network, rt = full.runtime;

  box.appendChild(el("h2", null, "Runtime"));
  const c = el("div", "card");
  const dl = el("dl", "kv");
  for (const [k, label] of [
    ["env", "runtime.env"],
    ["dev_source", "data source"],
    ["code_root", "code root"],
    ["port", "bound port"],
    ["uptime_s", "uptime (s)"],
  ]) {
    dl.appendChild(el("dt", null, label));
    const dd = el("dd");
    dd.appendChild(renderVal(rt[k]));
    dl.appendChild(dd);
  }
  c.appendChild(dl);
  if (rt.env.value === "dev-snapshot") {
    c.appendChild(
      el(
        "p",
        "muted",
        "CPU, memory and disk are deliberately not shown here. In dev mode " +
          "those would be this laptop's numbers wearing a Pi label."
      )
    );
  }
  box.appendChild(c);

  box.appendChild(el("h2", null, "systemd units on the target"));
  if (!u.available.value) {
    const cc = el("div", "card");
    const dd = el("p");
    dd.appendChild(renderVal(u.available));
    cc.appendChild(dd);
    box.appendChild(cc);
  } else {
    const t = el("table");
    t.innerHTML =
      "<thead><tr><th>Unit</th><th>ExecStart</th><th>EnvironmentFile</th></tr></thead>";
    const tb = el("tbody");
    for (const [name, info] of Object.entries(u.units || {})) {
      const tr = el("tr");
      tr.appendChild(el("td", "mono", name));
      tr.appendChild(el("td", "mono", info.exec_start || "—"));
      tr.appendChild(el("td", "mono", info.environment_file || "—"));
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    box.appendChild(t);
  }

  box.appendChild(el("h2", null, "Network (access point)"));
  for (const [label, blob] of Object.entries(n)) {
    const cc = el("div", "card");
    cc.appendChild(el("h3", null, label));
    if (!blob.available.value) {
      const p = el("p");
      p.appendChild(renderVal(blob.available));
      cc.appendChild(p);
    } else {
      const dl2 = el("dl", "kv");
      const keys =
        label === "hostapd"
          ? ["ssid", "wpa_passphrase", "hw_mode", "channel"]
          : ["interface", "dhcp-range", "dhcp-host"];
      for (const k of keys) {
        if (!(k in blob.settings)) continue;
        dl2.appendChild(el("dt", null, k));
        const dd = el("dd");
        // The AP passphrase is a secret: show presence, never the value.
        if (k === "wpa_passphrase") {
          dd.textContent = blob.settings[k]
            ? "set (redacted — " + blob.settings[k].length + " chars)"
            : "not set";
        } else {
          dd.textContent = blob.settings[k];
        }
        dl2.appendChild(dd);
      }
      cc.appendChild(dl2);
    }
    box.appendChild(cc);
  }
}

/* ------------------------------------------------------------------ */
/* Code                                                                */
/* ------------------------------------------------------------------ */
let currentFile = null;

async function codePage() {
  const box = document.getElementById("main");
  const listing = await api("/admin/api/code");

  const wrap = el("div", "grid");
  const left = el("div", "card");
  left.appendChild(el("h3", null, "Designated systems"));
  const fl = el("div", "filelist");
  for (const f of listing.files) {
    const b = el("button", null, f.path + (f.available.value ? "" : "  (absent)"));
    b.disabled = !f.available.value;
    b.addEventListener("click", (ev) => {
      ev.currentTarget.parentElement
        .querySelectorAll("button")
        .forEach((x) => x.classList.remove("sel"));
      ev.currentTarget.classList.add("sel");
      loadSource(f.path);
    });
    fl.appendChild(b);
  }
  left.appendChild(fl);
  wrap.appendChild(left);

  const right = el("div", "card");
  right.id = "srcpane";
  right.appendChild(el("h3", null, "Source"));
  right.appendChild(el("p", "muted", "Select a file on the left."));
  wrap.appendChild(right);
  box.appendChild(wrap);

  // Honour ?path=<rel> so other pages can deep-link straight to a file
  // (the architecture drawer links here). Falls back to the first
  // available file when the target is absent or not allowlisted.
  const want = new URLSearchParams(location.search).get("path");
  const files = listing.files || [];
  const target =
    (want && files.find((f) => f.path === want && f.available.value)) ||
    files.find((f) => f.available.value);
  if (target) {
    const b = fl.querySelector("button:not([disabled])");
    if (b) {
      // Click the button whose label matches the target so it highlights.
      for (const btn of fl.querySelectorAll("button")) {
        if (btn.textContent.indexOf(target.path) === 0) {
          btn.click();
          return;
        }
      }
      b.click();
    }
  }
}

async function loadSource(path) {
  const pane = document.getElementById("srcpane");
  pane.textContent = "";
  pane.appendChild(el("h3", null, path));
  let d;
  try {
    d = await api("/admin/api/code?path=" + encodeURIComponent(path));
  } catch (e) {
    pane.appendChild(el("div", "na", e.message));
    return;
  }
  const n = (d.redactions && d.redactions.value) || 0;
  if (n > 0) {
    pane.appendChild(
      el(
        "div",
        "note",
        n + " credential-shaped value(s) were masked in the copy shown " +
          "below. The file on disk is unchanged. A runnable copy of this " +
          "file will therefore NOT contain the real credentials."
      )
    );
  }
  const pre = el("pre", "src");
  const lines = (d.source || "").split("\n");
  lines.forEach((line, i) => {
    const ln = el("span", "ln", i + 1);
    const tx = el("span", "tx", line || " ");
    if (d.redactions && d.redactions.value && line.indexOf("«redacted»") >= 0) {
      tx.classList.add("hit");
    }
    pre.append(ln, tx, document.createTextNode("\n"));
  });
  pane.appendChild(pre);
}

/* ------------------------------------------------------------------ */
/* Diagnostics                                                         */
/* ------------------------------------------------------------------ */
async function diagnostics() {
  const box = document.getElementById("main");
  const btn = document.getElementById("slow");
  if (btn) {
    btn.addEventListener("click", async (ev) => {
      ev.currentTarget.disabled = true;
      ev.currentTarget.textContent = "running pyright…";
      paint(await api("/admin/api/diagnostics?slow=1"));
    });
  }
  paint(await api("/admin/api/diagnostics"));

  function paint(list) {
    box.textContent = "";
    box.appendChild(el("h2", null, "Findings (" + list.length + ")"));
    if (!list.length) {
      box.appendChild(el("p", "na", "NO CHECKS RAN — see notes below"));
      return;
    }
    list.forEach((f) => box.appendChild(findingNode(f)));
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const seg = location.pathname.split("/").pop();
  const which = (!seg || seg === "admin") ? "index.html" : seg;
  const pages = {
    "index.html": overview,
    "sensors.html": sensors,
    "data.html": dataPage,
    "system.html": system,
    "code.html": codePage,
    "diagnostics.html": diagnostics,
  };
  boot().then(() => {
    const fn = pages[which];
    if (!fn) return;
    fn().catch((e) => {
      const box = document.getElementById("main");
      if (box) {
        box.textContent = "";
        box.appendChild(el("div", "na", "CONSOLE ERROR: " + e.message));
      }
      console.error(e);
    });
  });
});
