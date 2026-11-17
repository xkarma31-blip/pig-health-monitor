# Gabay para sa Magsasaka — PigPulse v3

**Para sa: mga magsasaka sa Dapdap, Compostela, Cebu**
**Bersyon: Nobyembre 2026**

Angkop sa mga baboy na sinusuri para sa sakit ng hininga at init ng katawan.
Ang kagamitan ay **naka-install sa Raspberry Pi** sa inyong bahay, at ang
**phone app** ang inyong bintana sa datos.

---

## 1. Ano ang ginagawa nito para sa akin?

| | |
|---|---|
| **Kamera ng init (MLX90640)** | Sukat ang init ng katawan ng baboy kada 2 segundo — walang contact, walang gastos. Nakikita nang may lugar na **nag-iinit o naiipon ang init**, o **nanatiling malamig** ang lugar. |
| **Microphone (ESP32-S3)** | Nakikinig ng **humpa / ubo-ubo** at **buntong-hininga**. Ito ang maagang tanda ng sakit ng respiratory system. |
| **Kamera (Tapo CCTV)** | Itinatala ang video 24/7 para makita mo **ano talaga ang nangyayari** sa pen ngayon. |
| **Alerts sa phone** | Kapag may na-detect na problema, **nagpopop up agad** ang phone. Kasama rito ang **larawan mula sa kamera** sa oras ng alert. |

> **Mahalagang paalala:** ang device ay **nakakatulong** — hindi ito
> pagpapalit ng betinaryo. Kung may alerto, **konsulta ang betinaryo**.

---

## 2. Paano ko ito gagamitin araw-araw?

### A. Sa phone (Android)
1. I-install ang app na **Pig Health Monitor**.
2. **Pumunta sa WiFi na `PigPulse`** — gamitin ang password na **ibinigay ng
   inyong maintainer** (hindi ito nakasulat sa manwal na ito) — ito ang network
   ng device sa inyong bahay. Hindi kailangan ng internet para gumana ito.
3. Buksan ang app. I-set ang **address ng server**:
   `http://192.168.69.1:8090`
   (Ito ang "box" — ang device sa inyong tahanan.)
4. Pindutin ang **"Find networks"** kung kailangan ng WiFi setup.

### B. Tanda ng device sa pisika
- Itapon sa **pader**, mataas, malapit sa saksakan ng kuryente.
- Huwag itapon sa metal o sa tuyong lugar.
- Ilagay ang **camera (thermal)** sa taas, nakaharap sa **mga feeding area**.
- Ilagay ang **microphone** sa loob ng pen, malapit sa ulo ng mga baboy
  (nasa taas ng hangin ang hangin).

### C. Ang widget sa home screen ng Android

Ang **widget** ay maliit na kahon sa **home screen** ng inyong phone na
nagpapakita ng **huling temperatura** at **kalagayan ng device** — hindi na
kailangang buksan ang app.

**Paano idagdag:**
1. Pindutin nang **matagal** ang blangkong bahagi ng home screen.
2. Piliin ang **"Widgets"**.
3. Hanapin ang **PigPulse** / **Pig Health Monitor**.
4. Pindutin at i-drag ang widget sa home screen.

**Paano ito gumagana:**
- **Sinusundan nito ang tema ng app** — kung **light**, **dark** o **auto** ang
  naka-save na tema ng app, sumusunod ang widget sa piniling resulta
  (**light** o **dark**). **Walang hiwalay na setting.**
- Habang **aktibo at bukas ang app**, humihingi ito ng bagong datos bawat
  **~30 segundo**. Kapag naka-background o sarado ang app, maaaring i-suspend
  ng Android ang pag-update. Maaaring i-render muli ng system ang **huling
  naka-save na estado**, ngunit hindi garantisang fresh na datos ang naro-on
  pagkatapos ng humigit-kumulang 30 minuto.
- Kapag **walang koneksyon**, makikita pa rin ang **huling nabasang numero**,
  pero **tumatanda** ang oras nito (mula "Updated just now" → "Updated 4 min
  ago" → "Data may be stale"). **Hindi ito bagong sukat.**

> **Mahalaga:** ang widget ay **hindi** nagsasabi kung may **lagnat** ang baboy.
> Kung wala itong natanggap na kalagayan, ipapakita nito ang **"No reported
> device status"** — **hindi ito nangangahulugang malusog, at hindi rin
> lagnat.** Ang **scene centre** ay temperatura ng **lugar**, hindi ng baboy.

**Kung hindi na nag-uupdate ang widget:**
1. Tiyaking **naka-connect sa WiFi na `PigPulse`**.
2. **Buksan ang app** — ang pagbukas nito ang muling nagpapa-update ng widget.
3. Kung ayaw pa rin, **tanggalin** ang widget at **idagdag ulit** (sundin ang
   "Paano idagdag" sa itaas).
4. Kung tuluyang walang laman, ito ay **maintenance** — sabihin sa **maintainer**
   (tingnan ang Bahagi 8).

---

## 3. Ano ang ibig sabihin ng mga ALERT?

### 🔴 `HYPERTHERMIA` — napupunta na
> Katawan ng baboy **lampas sa 41°C**.

**Agad nang gawin:**
1. **Ilipat agad** sa **salamat / cooler area** (basa o malamig na lupa).
2. **Tubig** sa sobra — pero **maliit** na dami kada oras, huwag palitan ang tubig.
3. **Alisin** ang mgahad sa init sa pen (masyadong marami ang tao, walang hangin).
4. **Tawagan ang betinaryo agad.**

### 🟠 `FEVER` — may lamok
> Katawan ng baboy **lampas sa 40°C** (normal: **38.5–39.5°C**).

**Gawin:**
1. Subukan ang temperatura nang husto (kung may termometer).
2. Bantayan ang baboy: kumakain ba? tulog ba? may dumi ba?
3. Kung **lalo pa sa 40.5°C** o may **paggawa ng dumi / hindi kumakain** →
   **tawagan ang betinaryo**.
4. Kung pumigil na ang lalamunan at mahirapan sa paghinga → **emergency**.

### 🟡 `COUGH` — umiiyak
> Nadetect ang tunog na para sa **humpa o ubo-ubo**.

**Gawin:**
1. Pakinggan nang mabuti ang baboy sa loob ng 10 minuto.
2. Kung may **pananakit ang hininga** o **pagsumanga** → betinaryo.
3. Kung minsan lang at hindi malinaw ang tunog → bantayan lamang, tapos i-record.

### ⚪ `INFO` — paalala lamang
Hindi kailangang alagaan ngayon. Nakikita lang para sa pagbabantay.

---

## 4. Paano ko babasahin ang DETAILS ng alert?

Kapag pindutin mo ang isang alert sa phone:
- **CAUSE** — malinaw na paliwanag kung bakit nag-alert (at kung ano ang gagawin).
- **CAPTURE FRAME** — ang **larawan mula sa CCTV** sa mismong oras ng alert.
  Ito ang pinakamahalagang parte: **ikaw ang makikita kung ano talaga ang nangyayari**.
- **DEVICE READINGS** — ang mga bilang (temperatura) sa loob ng 30 minuto sa
  paligid ng alert, para makita mo kung **trending pababa o pataas**.

---

## 5. Kapag may problema at hindi gumana

| Problema | Ano ang gagawin |
|---|---|
| App: "Connection unavailable" | 1) Tiyak na naka-connect sa WiFi na **`PigPulse`**. 2) Buksan ang browser: `http://192.168.69.1:8090/api/health` — dapat ang sagot ay `{"message":"API is healthy."}`. |
| Walang alerts | Maaaring **normal** — walang naramdam na problema. Pero kung ang thermal ay **"Sensor error"** sa app, sabihin sa **maintainer**. |
| **"Sensor error"** o walang temperatura | Ang **thermal sensor** ay may problema (kable o pin). Ito ay **maintenance**, hindi sa user. Tawagan ang maintainer. |
| Walang tunog / audio | Maaaring **hindi naka-connect** ang ESP32-S3 sa AP. Kailangan ng **power cycle** (i-off ang power, saka i-on muli). |
| Walang video (CCTV offline) | Ang camera ay offline o nakaubos ang WiFi. Suriin ang camera ay nakasunod sa `PigPulse`. |
| Disk puno na | Awtomatikong nagde-delete ang lumang video (48 oras). Ang **alerts ay hindi napapalabas**. |

---

## 6. Mahalagang paalala tungkol sa privacy at paggamit

- Ang video ay **nasa loob ng inyong sariling network** lamang. Hindi ito
  ipinapadala sa internet kundi may **opt-in na cloud sync**.
- Ang alert na may kamerang larawan ay **para sa iyong tulong**, hindi para sa
  "pagsubaybay" sa ibang tao. Pakisunod ang **atas ng iyong komunidad** tungkol
  sa pag-iimbak ng video ng mga magsasaka.
- **Huwag ilagay ang device sa loob ng kamote** o sa masyadong mainit na lugar.

---

## 7. Kung may emergency

**Tawagan ang betinaryo o ang pinakamalapit na ospital o tagapag-alaga ng hayop.**
Hindi palitan ng device ang **pangangalaga ng manggagawa**.

Mabilis na gabay:
| tanda | ibig sabihin |
|---|---|
| **Hihingan nang malakas, huling na sa dulo** | Maaaring **pneumonia**. Emergency. |
| **Puti o blue ang labi/matuid** | **Walang oxygen** — emergency. |
| **Hindi na makagalaw, nakatumba** | Maaaring **mga-hot stroke** (sobra ang init). Emergency. |
| **Nagsisimula na, tapos biglang nawala** | Maaaring **colic** o **tapos isang atake**. Tawagan agad. |

---

## 8. sino ang maintenance?

Ang device at ang app ay pinananatili ng **project team** (PigPulse).
Kung may **"Sensor error"**, **walang alerts pero may "system" logs**, o may
**bagong tanong hindi nasagot sa manual na ito** — makipag-ugnayan sa
**maintainer** bago baguhin ang kagamitan. Ang mga setting (WiFi, password,
lokal na disk) ay maaaring masira kung baguhin nang walang kaalaman.

---

### Checklist bago umalis ng bahay

- [ ] Naka-on ang Pi (power light) at nakakonekta sa router
- [ ] Nakakonekta ang phone sa WiFi na `PigPulse`
- [ ] Bukas ang app → nakikita ang **live na temperatura**
- [ ] Nakikita ang **larawan** ng camera (Live view)
- [ ] Nasubukan ang isang alerto (**test**)

*Isang paalala: ang device ay kagamitan sa **pagsubaybay**, hindi sa **pagsusuri ng
 sakit**. Ang diagnosis ay gawa ng betinaryo.*
