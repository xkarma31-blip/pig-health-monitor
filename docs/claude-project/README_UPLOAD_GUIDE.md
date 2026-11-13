# PigPulse Canon for Claude Projects — Upload Guide

**Prepared 2026-11-02.** Seven files + one instruction block. Nothing needs to be
removed from the project — these files supersede the stale entries on their own.

---

## What to do — 3 steps

**Step 1 — Instructions.** Open your Claude Project → **Instructions** field. Delete
what is there and paste the whole of `00_PROJECT_INSTRUCTIONS.txt`. That is the one
field you can edit directly, and it is the one that changes behaviour.

**Step 2 — Upload the six canon files** into the project's knowledge base:

| File | After upload the Memory row should read |
|---|---|
| `01_CANON_CORE.md` | **Overview** — replace |
| `02_CANON_THERMAL.md` | **Architecture** — replace |
| `03_CANON_AUDIO_FUSION.md` | **Research And Practices** — replace |
| `04_CANON_SYSTEM.md` | **Pig Health Monitoring** — replace |
| `05_CORRECTIONS_REGISTER.md` | new entry — **Corrections** |
| `06_SOURCE_REGISTER.md` | new entry — **Sources** |

**Step 3 — Turn OFF "Use account memory"** (the toggle in your screenshot).

> **Why this matters.** That toggle lets Claude blend memories from *other*
> projects and chats into this one. Your `Overview` and `Architecture` entries were
> updated *1 hour ago*, while `Pig Health Monitoring` and `Research And Practices`
> date from **14 Sep** and **30 Sep 2026** — both **before** the 02 Nov audit. With
> account memory on, the old values can resurface and outrank the new files.
> Turning it off makes this project's files the only memory in play. **That is the
> cleanest way to make the canon authoritative without deleting anything.**

`07_GROUNDING_PROTOCOL.md` can also be uploaded as a seventh entry — it is the
"consciously investigate" half of what you asked for.

---

## The short version of what changed

The problem was never the maths — **26 of 26 calculations reproduce exactly.** The
problem was that **the same quantity held different values in different documents**,
and that some citations could not be found in the live literature.

**Four defence-critical corrections:**

1. **MLX90640 pixel pitch is 17.9 × 12.8 cm at 2 m, not 6 × 5 cm.** The 6 × 5 figure
   belongs to the *other* FOV variant (55°, part BAB), while the project specifies the
   110° BAA part — the stated pitch must match the specified sensor. The underlying
   conclusion is safe either way: the ear ROI is **0.22 px** at 2 m with the 110° part
   and only **1.46 px** with the 55° part. **Sub-pixel at every practical distance,
   with either variant** — so the "no ear thermometer is possible" result is
   geometrically airtight, which is a stronger position than the documents currently
   argue. *(An earlier "570 px per pig" working figure was withdrawn — it did not
   reproduce; the correct figure is 21 px/pig at 2 m.)*

2. **The emissivity correction was applied in Celsius, not Kelvin.** `38.5 / 0.978^0.25`
   gives +0.21 °C in Celsius but **+1.74 °C** in Kelvin. It was understated **8.1×**
   — and +1.74 °C is larger than the entire 1.5 °C fever threshold. Also: the
   MLX90640's `CalculateTo()` already accepts emissivity, so check you are not
   correcting twice.

3. **"~30 mA average → ~170 hours" cannot both be true.** 30 mA gives ~53 h;
   170 h needs ~9.4 mA.

4. **"Spectral subtraction hurts deep learning" is contradicted.** SS-ESC 2024 found
   SS *improved* classification, and a 2026 pig-cough localisation paper uses
   adaptive SS. Say "approaches differ" instead.

**Also fixed:** an impossible CNN layer (3×3 convolution on height 1), a framing
inconsistency (25 ms/10 ms cannot yield 49 frames — that is Edge Impulse's 32/20 ms
default), an underived uncertainty threshold, an I²C timing figure ~4× too slow, a
health-score mapping that is not linear, and a payback calculation for five pigs
sitting in a chapter whose abstract describes one animal.

**One citation is misattributed:** the 99.7 % pig-cough figure belongs to the Edge
Impulse project *"When Pigs AI"*, not to "Oduor et al." Four further citations
(PHP 6B loss, Frontiers 2023, JMBM 2025, Baluyut 2019) are **untraceable** — trace
or delete.

---

## Why this makes the project stronger, not weaker

An examiner who finds a wrong pixel pitch or an untraceable citation in a *finished*
thesis has grounds to distrust everything else. An examiner who finds a **corrections
register**, a **provenance tag on every number**, and an explicit statement of what
the hardware cannot do is looking at a researcher who audits their own work.

**That is the AGUA standard** — thorough, mindful, verified. The negative results
are the contribution, not the failure.
