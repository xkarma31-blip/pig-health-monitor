/**
 * PigTrend - the shared chart implementation for the PigPulse dashboards.
 *
 * ONE implementation, used by BOTH the port-8080 dashboard and the /diag
 * page, so the two can never drift apart.
 *
 * Rules this file exists to enforce:
 *  1. A missing reading is a GAP, never a zero and never a straight segment
 *     across the gap - the shape of the data is never invented.
 *  2. A gap threshold follows the data (more than one missed reading), so a
 *     fast publisher's jitter is not an outage and a slow publisher's outage
 *     is not hidden.
 *  3. Every axis is labelled and the scale is derived from the data.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function hhmm(t) {
    var d = new Date(t * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function hhmmSec(t) {
    var d = new Date(t * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /**
   * One line chart as inline SVG.
   * points: [{t: epoch seconds, v: value}]
   */
  function drawTrend(points, unit, w, h, opts) {
    opts = opts || {};
    var color = opts.color || '#3ddc84';
    var padL = 56, padR = 14, padT = 12, padB = 30;
    var iw = w - padL - padR, ih = h - padT - padB;
    if (!points || !points.length) {
      return '<p class="note">No readings yet.</p>';
    }
    var vs = points.map(function (p) { return p.v; });
    var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
    // Padding is proportional to the data, so one rule serves volts, percent,
    // degrees and load average alike. A flat series gets a +-0.5% band, which
    // keeps millivolt-scale movement visible instead of hiding it in a
    // half-volt-wide axis.
    var mid = (hi + lo) / 2;
    var spread = hi - lo;
    var pad = Math.max(spread * 0.1, Math.abs(mid) * 0.005, 0.001);
    lo -= pad; hi += pad;
    var t0 = points[0].t, t1 = points[points.length - 1].t;
    var span = Math.max(1e-6, t1 - t0);
    var X = function (t) { return padL + ((t - t0) / span) * iw; };
    var Y = function (v) { return padT + ih - ((v - lo) / (hi - lo)) * ih; };

    var grid = '';
    [0, 0.5, 1].forEach(function (f) {
      var y = padT + ih * f;
      var val = hi - (hi - lo) * f;
      grid += '<line x1="' + padL + '" y1="' + y + '" x2="' + (w - padR) + '" y2="' + y +
        '" stroke="#2b2d2f" stroke-width="1"/>' +
        '<text x="' + (padL - 8) + '" y="' + (y + 5) + '" fill="#a6a9a6" font-size="13" text-anchor="end">' +
        val.toFixed(opts.decimals === undefined ? 2 : opts.decimals) + esc(unit) + '</text>';
    });

    // Gap rule: break on more than one missed reading, with a floor so a
    // fast publisher's ordinary jitter is not mistaken for an outage.
    var deltas = [];
    for (var i = 1; i < points.length; i++) deltas.push(points[i].t - points[i - 1].t);
    deltas.sort(function (a, b) { return a - b; });
    var median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 10;
    var gapLimit = Math.max(opts.gapFloor || 15, median * (opts.gapFactor || 2));

    var gaps = [];
    for (var g = 1; g < points.length; g++) {
      if (points[g].t - points[g - 1].t > gapLimit) gaps.push(g);
    }

    function segPath(seg) {
      if (!seg.length) return '';
      var d = seg.map(function (p, j) {
        return (j ? 'L' : 'M') + X(p.t).toFixed(1) + ',' + Y(p.v).toFixed(1);
      }).join(' ');
      return '<path d="' + d + '" fill="none" stroke="' + color +
        '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    }

    var paths = '', seg = [points[0]];
    for (var k = 1; k < points.length; k++) {
      if (gaps.indexOf(k) >= 0) { seg.push(points[k - 1]); paths += segPath(seg); seg = [points[k]]; }
      else { seg.push(points[k]); }
    }
    seg.push(points[points.length - 1]);
    paths += segPath(seg);

    var dots = points.map(function (p) {
      return '<circle cx="' + X(p.t).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) +
        '" r="2.6" fill="' + color + '"/>';
    }).join('');

    var xlabels = '<text x="' + padL + '" y="' + (h - 10) + '" fill="#a6a9a6" font-size="13">' +
      hhmm(t0) + '</text>' +
      '<text x="' + (w - padR) + '" y="' + (h - 10) + '" fill="#a6a9a6" font-size="13" text-anchor="end">' +
      hhmm(t1) + '</text>';

    // Reboot markers: a boot id change means the Pi restarted - often a
    // power event. It is labelled, because "the graph stops here" is the
    // question this graph exists to answer.
    var reboots = '';
    (opts.reboots || []).forEach(function (rb) {
      var x = X(rb.t);
      if (x < padL || x > w - padR) return;
      reboots += '<line x1="' + x.toFixed(1) + '" y1="' + padT + '" x2="' + x.toFixed(1) +
        '" y2="' + (padT + ih) + '" stroke="#ffd166" stroke-width="1.5" stroke-dasharray="5,4"/>' +
        '<text x="' + (x + 4).toFixed(1) + '" y="' + (padT + 12) + '" fill="#ffd166" font-size="12">' +
        esc(rb.label) + '</text>';
    });

    var gapNote = gaps.length
      ? '<p class="note">' + gaps.length + ' gap(s) in the record (nothing sampled) - drawn as breaks, not interpolated.</p>'
      : '';
    var rebootNote = (opts.reboots || []).length
      ? '<p class="note warn">' + opts.reboots.length + ' reboot(s) inside the window - the gap before one is downtime (a power cut looks exactly like this).</p>'
      : '';

    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h +
      '" role="img" aria-label="Trend chart">' + grid + reboots + paths + dots + xlabels +
      '</svg>' + gapNote + rebootNote;
  }

  /**
   * Render EVERY series in a payload as its own chart - "all the graphs".
   * series: { "device.field": {points, unit, n, last_age_s} }
   */
  function renderAll(series, opts) {
    opts = opts || {};
    var wrap = opts.wrapperClass || 'card';
    var titleTag = opts.titleTag || 'h2';
    var keys = Object.keys(series || {});
    if (!keys.length) {
      return '<p class="note">' +
        esc(opts.emptyMessage || 'No history yet - the page starts collecting as soon as a device reports.') +
        '</p>';
    }
    return keys.map(function (k) {
      var s = series[k];
      var label = k.replace(/\.center$/, ' · scene temp').replace(/\.ambient$/, ' · ambient')
                    .replace(/\.rms$/, ' · mic rms').replace(/\.peak$/, ' · mic peak')
                    .replace(/\.v_core$/, ' · core voltage').replace(/\.temp_c$/, ' · cpu temp')
                    .replace(/\.load1$/, ' · load (1 min)').replace(/\.mem_pct$/, ' · memory used')
                    .replace(/\.disk_pct$/, ' · disk used').replace(/\.uptime_h$/, ' · uptime (h)');
      var age = s.last_age_s;
      var stale = age !== undefined && age > (opts.staleAfter || 120);
      var ageText = age === undefined ? 'unknown'
        : (age < 90 ? Math.round(age) + ' s ago' : (age / 60).toFixed(1) + ' min ago');
      var body = s.n < 2
        ? '<p class="note">Only ' + s.n + ' reading(s) so far - a trend needs at least two.</p>'
        : drawTrend(s.points, s.unit || '', opts.width || 860, opts.height || 240, {
            color: opts.colorFor ? opts.colorFor(k) : undefined,
            decimals: (s.decimals !== undefined) ? s.decimals : opts.decimals,
            reboots: opts.reboots,
            gapFloor: opts.gapFloor,
            gapFactor: opts.gapFactor
          });
      return '<div class="' + wrap + '"><' + titleTag + '>' + esc(label) + '</' + titleTag + '>' + body +
        '<p class="note' + (stale ? ' warn' : '') + '">' + s.n + ' reading(s) · last ' +
        esc(ageText) + (stale ? ' · STALE: nothing is being reported' : '') + '</p></div>';
    }).join('');
  }

  global.PigTrend = {
    esc: esc, hhmm: hhmm, hhmmSec: hhmmSec,
    drawTrend: drawTrend, renderAll: renderAll
  };
})(typeof window !== 'undefined' ? window : this);
