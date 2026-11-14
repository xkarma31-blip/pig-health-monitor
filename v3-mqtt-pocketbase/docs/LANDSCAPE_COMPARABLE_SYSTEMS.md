# Landscape — comparable pig-health monitoring systems, and how PigPulse differs

*Research note, 2026-11-14. Sources are linked; claims by vendors are marked as
vendor claims, not measurements of ours.*

## Why this note exists

The brief was: find the comparable commercial and academic work, and be explicit
about where **commercial research is expensive and assumes a controlled
environment** — which is not the environment the boxes actually run in
(tropical smallholder, fan noise, no reliable internet, no IT staff).

The honest summary: **every commercial system in this space assumes the farm has
reliable Wi-Fi mesh, cloud access and a budget.** Every open-source or research
system that matches our environment is small, recent, or a competition project.
That gap is the justification for PigPulse's design, not a marketing claim.

---

## 1. Commercial systems

### SoundTalks — AI sound for swine respiratory health
<https://www.soundtalks.com/en/swine-respiratory-health-monitoring>

- Plug-and-play **sound monitor** → cloud dashboard, 24/7, smartphone alerts.
- **Vendor claims**: detect respiratory disease up to **5 days earlier** than
  manual checks; **+12.7 g average daily gain**; **−23 % individual therapy**;
  **ROI 2.52–7.90 (avg 4.27)**.
- **Requires**: Wi-Fi-mesh network, cloud access, humidity/temperature sensors,
  LED indicators, per-unit hardware and a recurring cloud subscription.
- **Difference from PigPulse**: SoundTalks is a *cloud service with a sensor*.
  Our design is the inverse — the data stays on the box, the app talks to the
  box directly, and **internet is optional**. A barn with no internet is not a
  degraded SoundTalks; it is a fully working PigPulse.

### Fancom — full pig-house automation
<https://www.fancom.com/pigs>

- Automated weighing, climate control, feeding and whole-house management for
  commercial barns.
- **Difference**: Fancom sells *house automation* (feed, climate, weight) at
  commercial scale; it does not do ML-based acoustic respiratory screening in a
  smallholder pen. Our scope is the health signal, on hardware a smallholder
  can actually own.

### Other commercial/industrial players
Optifarm (AU), XOCtech, Nedap, Datamars/MSD Animal Health, BigWits and
similar precision-livestock platforms all sit in the same shape: gateway +
sensors + cloud subscription + integration into an existing barn system. The
pattern is consistent enough that it is worth stating plainly — **the recurring
cost is the cloud and the mesh, not the sensor.**

## 2. Academic work

### Machine Learning-Based Detection of Pig Coughs and Their Association with
Respiratory Diseases in Fattening Pigs
*Animals (MDPI) 12(9):818, 2025 — Yamsakul et al., Chiang Mai University + DLD Lampang*
<https://www.mdpi.com/2306-7381/12/9/818>

**This is the closest published work to our situation**, and it is the one that
answers the noise question directly.

- **Setting**: **49 fattening pigs on small-holder farms affiliated with the
  Chiang Mai–Lamphun Pig Farmers Cooperative**, Thailand — tropical, smallholder,
  same class of environment as Dapdap/Compostela. *Not* a climate-controlled
  research barn.
- **Results**: ML cough-detection **accuracy 0.72**, versus **0.69 for the
  farmers** judging the same recordings. So the model beats the human listener
  by a small margin, not by an order of magnitude. Honest framing: the value is
  *consistency and 24/7 coverage*, not a dramatic accuracy jump.
- **Clinical link — the important one**: **non-productive coughs correlate
  strongly with *Mycoplasma hyopneumoniae*** (Spearman **0.80**, Cohen's κ
  **0.79**), and **not** with PCV2 (**0.05 / 0.037**). They also report
  bacterial Mh typically causes non-productive cough while viral infections tend
  to cause productive cough.
  → *This is directly actionable for the vet-facing copy*: the cough **type**
  (productive vs non-productive) is the clinically meaningful signal, not the
  raw count. Our alert copy should ask for cough character, not just "cough".
- **Noise and deployment** — they explicitly discuss real-world implementation:
  **optimal sensor placement inside the pen**, **directional microphones** to
  improve signal, and **noise-filtering techniques to keep the signal robust in
  high-noise environments**, plus the **cost-benefit trade-off of AI cough
  monitoring versus conventional veterinary surveillance**.
  → *This is published support for the concern you raised*: a constant fan is
  exactly the high-noise environment they had to engineer against, and they
  handled it with **placement + directionality + filtering**, not with a
  quieter barn. That is the design direction for our ESP32-S3 (aim the mic,
  band-pass the fan band, reject on SNR rather than on absolute amplitude).
- **Disease prevalence context for the region**: PRRSv in **>70 %** of Thai
  commercial herds; PCV2 **60–80 %**; Mh **>50 %**; swine influenza 10–20 %.
  PRRSv and Mh are the primary respiratory causes there.
  → *Useful for the manual*: a chronic cough in this region most likely points
  at Mh (enzootic pneumonia) with PRRSv co-infection, not at PCV2.

### Animalia — IoT temperature monitoring for piggery farming
*2025, Nigeria* — <https://www.irejournals.com/paper-details/1710768>

- **ESP32** + stainless-steel temperature sensors + charger module + Li-ion
  battery → cloud upload → mobile-friendly interface.
- Evaluated with the UTAUT acceptance model: **81.8 %** agreed it improves
  health management; **81.9 %** said it reduces disease risk; **72.8 %** trusted
  its data-security compliance.
- **Difference**: Animalia measures **ambient/skin temperature from probes**,
  not body-surface temperature from a thermal camera, and it **requires the
  cloud**. Ours is a thermal camera + microphone with local storage.

### PigWatch — offline edge-AI disease warning (Cameroon smallholders)
Edge Impulse project write-up — <https://www.linkedin.com/posts/nkiambouh-tasha-bronu-5224023a8_pigwatch-iot-edgeai-activity-7468167421791645696-o1Up>

- **ESP32-CAM + FOMO CNN** running on the chip via **Edge Impulse**; detection
  above **75 % confidence** triggers an **ESP-NOW** radio alert to the farmer's
  house.
- Explicitly: *"completely offline, no internet, no cloud, no veterinarian
  needed on site"*, built for **smallholder farmers in Northwest Cameroon**.
- **Difference**: camera-and-ML on an MCU (cheap, but needs lighting and
  sightlines); ours is thermal + acoustic on a Pi with a local database.

### pig-agri — open-source vision-based welfare monitoring
<https://github.com/esp8266good/pig-agri> (MIT, non-commercial research software,
"currently deployed and running on a working pig farm")

- Ordinary cameras → per-pig tracking → **activity rate vs the herd median** →
  health alert, with **hysteresis to stop alert flapping**; ffmpeg HLS pipeline
  and a web UI for live + recorded video.
- **Difference**: behavioural anomaly from RGB video rather than body
  temperature from thermal and sound from a mic. Their **hysteresis** lesson
  (don't alert on every small dip) applies to us: our thermal publisher already
  latches an alert until the condition clears, which is the same idea.

## 3. What the evidence says we should do

1. **Treat cough TYPE, not cough count, as the clinical signal.** The strongest
   published link is non-productive cough → Mh. Our manual should ask for it
   and the alert copy should prompt for it.
2. **Design for noise, don't pretend it away.** Placement + directionality +
   filtering are the published answers to a constant fan. An SNR/rejection
   gate beats an absolute-amplitude threshold.
3. **Be honest that the classifier is only a little better than a farmer**
   (0.72 vs 0.69). The win is *24/7 consistency and an alert with the frame
   attached*, not a diagnosis. Our copy should never imply diagnosis.
4. **Offline-first is not a compromise — it is the enabling feature** for this
   environment, and PigWatch independently made the same call for Cameroon.
5. **Alert flapping is a known failure mode** (pig-agri needed hysteresis; our
   publisher latches for the same reason).

## 4. Where PigPulse genuinely differs (and where it does not)

| | Commercial (SoundTalks/Fancom) | Research (Chiang Mai, Animalia) | PigPulse today |
|---|---|---|---|
| Needs internet | Yes (cloud) | Animalia: yes (cloud) | **No** — works on the box's own AP |
| Cost model | hardware + subscription | grant/project | one Pi + sensors |
| Signal | cloud ML on managed audio | curated recordings, model | thermal + mic, **not yet a validated cough model** |
| Clinical specificity | proprietary | Mh link (0.80/0.79) | **we do not claim this yet** |
| Evidence | vendor trials | peer-reviewed | **prototype — not validated** |

**The honest limitation:** we do **not** yet have a validated cough classifier
or a published body-temperature accuracy figure. The Chiang Mai paper shows a
0.72 cough-detection accuracy is achievable on smallholder farms — that is our
realistic target, and we should not claim more than that.

## 5. References

1. Yamsakul P., Yano T., Junchum K., Anukool W., Kittiwan N. (2025).
   *Machine Learning-Based Detection of Pig Coughs and Their Association with
   Respiratory Diseases in Fattening Pigs.* Animals 12(9):818.
   <https://www.mdpi.com/2306-7381/12/9/818>
2. SoundTalks — swine respiratory health monitoring.
   <https://www.soundtalks.com/en/swine-respiratory-health-monitoring>
3. Fancom — automation systems for pigs. <https://www.fancom.com/pigs>
4. Adeoye M.O., Arogundade O.T., Olaleye T. (2025). *Animalia: An IoT-based
   Temperature Monitoring System for Piggery Farming.*
   <https://www.irejournals.com/paper-details/1710768>
5. PigWatch — IoT Edge AI Early Disease Warning System (Cameroon smallholders).
   <https://www.linkedin.com/posts/nkiambouh-tasha-bronu-5224023a8_pigwatch-iot-edgeai-activity-7468167421791645696-o1Up>
6. pig-agri — open-source vision-based pig welfare monitoring (MIT).
   <https://github.com/esp8266good/pig-agri>
