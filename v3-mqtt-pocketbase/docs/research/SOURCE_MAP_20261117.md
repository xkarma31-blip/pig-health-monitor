# Source-to-application map — 2026-11-17

Every externally sourced claim below is tied to a sentence actually read. Facts from the Pi/app are labelled `[M]` measured, `[S]` source/config, `[I]` inference. Search snippets alone are not evidence.

---

## Android adaptive icon safe zone

| Source | Exact sentence read | Applied to PigPulse |
|---|---|---|
| Android Developers, Adaptive icons: https://developer.android.com/develop/ui/compose/system/icon_design_adaptive | “The 66x66 safe zone depicted is the area that is never clipped by a shaped mask defined by an OEM.” | The green waveform is fitted inside 60% of the 1024px canvas so it is never cropped by circular/squircle masks. |
| Same | “Use a logo that's at least 48x48 dp. It must not exceed 66x66 dp, because the inner 66x66 dp of the icon appears within the masked viewport.” | Foreground/monochrome layers rebuilt with transparent outer area; background stays full bleed. |

## Thermal radiometry and fever claims

| Source | Exact sentence read | Applied to PigPulse |
|---|---|---|
| Melexis MLX90640 datasheet rev 11, via SparkFun mirror: https://raw.githubusercontent.com/sparkfun/Qwiic_IR_Array_MLX90640/master/Documentation/MLX90640-Datasheet-Melexis.pdf | “All accuracy specifications apply under settled isothermal conditions only. Furthermore, the accuracy is only valid if the object fills the FOV of the sensor completely.” | Surface estimate only; require ROI/occupancy validity; never call a reading a confirmed fever. |
| Same datasheet | “In order to compensate correctly for the emissivity and achieve best accuracy we need to know the surrounding temperature which is responsible for the second component of the IR signal namely the reflected part” | Store emissivity/reflected-temperature metadata instead of hiding constants. |
| FLIR T810664: https://docs.flir.com/T810664/en-US/latest/s08.html | “Emissivity is the most important measurement parameter to set correctly.” | Emissivity is a first-class calibration concern. |
| Reza et al. 2024 review: https://pmc.ncbi.nlm.nih.gov/articles/PMC11007457/ | “accurate temperature measurement requires consideration of important thermal imaging parameters, such as emissivity, reflected temperature, distance to the target, ambient temperature, and humidity” | Distance, ambient and humidity belong in the data record; a single global threshold is not enough. |
| Same review | “it should complement, not replace, conventional veterinary care” | App language must say screening, not diagnosis. |

## Thermal super-resolution and RGB fusion

| Source | Exact sentence read | Applied to PigPulse |
|---|---|---|
| Huang et al. 2025 IRSR systematic review: https://doi.org/10.1109/jstars.2025.3614673 | “thermal images typically exhibit low contrast, limited high-frequency details, and sensor-specific noise.” | Upscaling cannot invent real micro-detail; treat SR as visualization, not new radiometric evidence. |
| Raimundo et al. 2021: https://pmc.ncbi.nlm.nih.gov/articles/PMC7916566/ | “the resolution of thermal sensors will not equal that of other sensors (visible and near-infrared spectrum range) in the short and medium term” | Do not expect MLX90640 32×24 to match the Tapo RGB frame. |
| Same paper | “a ratio of more than four may lead to unexpected artifacts and to the failure of processes” | Fusion must record resolution ratio and quality; the current 32×24-to-RGB gap is high-risk. |
| Raimundo et al. 2021 | “It is essential to visually inspect the study zone at the time the thermal data is taken, as objects in thermal imaging lack contrast, making it difficult to identify the focus.” | Keep the visible frame beside the thermal frame for human verification. |
| TISR challenge synthesis 2026: https://doi.org/10.5565/rev/elcvia.2374 | “Remaining challenges include robust cross-spectral alignment, computational efficiency for resource-constrained deployment, broader dataset diversity across conditions, and resilience to noise and environmental variation.” | Registration quality and runtime cost are explicit acceptance gates. |
| Same paper | “sensitivity to residual misregistration” | Show registration error; refuse fused claims when misregistration exceeds budget. |
| Krapels et al. 2007: https://doi.org/10.1364/ao.46.004594 | “There can be a dramatic improvement in range performance when superresolution algorithms are applied to undersampled imager outputs.” | SR is only justified for undersampled outputs with sub-pixel motion; a fixed camera needs different evidence. |

## Pig identification and tracking

| Source | Exact sentence read | Applied to PigPulse |
|---|---|---|
| Zhang et al. 2019: https://www.mdpi.com/1424-8220/19/5/1188 | “Individual pig detection and tracking is an important requirement in many video-based pig monitoring applications. However, it still remains a challenging task in complex scenes, due to problems of light fluctuation, similar appearances of pigs, shape deformations, and occlusions.” | Pen-level first; individual ID is best-effort. |
| Same paper | “our method achieves precision of 94.72%, recall of 94.74%, and MOTA of 89.58%.” | This is a research benchmark on commercial-farm 1080p footage, not PigPulse's current capability. |
| van der Zande et al. 2021: https://www.frontiersin.org/journals/animal-science/articles/10.3389/fanim.2021.669312/full | “manual corrections may be needed to keep track of the individual throughout the video and estimate activity.” | Human confirmation step required. |
| Psota et al. 2020: https://www.mdpi.com/1424-8220/20/13/3670 | “Individual animals are also equipped with ear tags that are used by a classification network to assign unique identification to instances.” | Ear tags/depth are part of the published high-accuracy approach; not present in our setup. |
| Schmidt et al. 2022: https://pmc.ncbi.nlm.nih.gov/articles/PMC9298813/ | “The NUtrack system achieved an overall accuracy for ID of 95.6%.” | Published systems use depth camera + ear tags; do not transfer this number to our RGB-only scaffold. |

## Expo Hosting vs Vercel

| Source | Exact sentence read | Applied to PigPulse |
|---|---|---|
| Expo publishing guide: https://docs.expo.dev/guides/publishing-websites/ | “An Expo web app can be served locally for testing the production behavior, and deployed to a hosting service. We recommend deploying to Expo Hosting for the best feature support.” | Expo Hosting is a supported target, not `.expo` source directory. |
| Same | “Uploading only the client directory to a static host does not provide server rendering.” | Vercel static deploy cannot serve API routes/server output. |
| Expo Hosting get started: https://docs.expo.dev/eas/hosting/get-started/ | “Expo Hosting is a react hosting service that allows you to deploy an exported Expo web build to a preview or production URL.” | `.expo.app` is a hosting URL, not a different app/runtime. |
| Expo Hosting docs: https://docs.expo.dev/eas/hosting/get-started/ | “if you choose `my-app` as your preview subdomain name, your preview URL would look something like this: `https://my-app--or1170q9ix.expo.app/`, and your production URL would be: `https://my-app.expo.app/`.” | Deployment URLs and production URLs explained to user. |
| Expo Vercel section | “buildCommand: expo export -p web”, “outputDirectory: dist”, rewrites all routes to `/` | Current Vercel setup uses SPA-compatible export and rewrite. |

## Tapo / CCTV

| Source | Exact sentence read | Applied to PigPulse |
|---|---|---|
| TP-Link FAQ 2680: https://www.tp-link.com/us/support/faq/2680/ | “The Tapo RTSP stream URL uses the format rtsp://username:password@IP Address/stream1 for high quality or rtsp://username:password@IP Address/stream2 for standard quality.” | Direct RTSP path; no Tapo app needed at runtime. |
| Same | “You must create a camera account in the Tapo app before connecting to any third-party platform.” | Tapo app is provisioning-only. |
| Same | “Only two of these three options can run at once: Tapo Care, SD card recording, and NVR/NAS/ONVIF software recording.” | Our RTSP/NVR path + SD is supported; Tapo Care must be off. |
| Same | “No two-way audio: Tapo cameras support ONVIF Profile S, which does not include two-way audio.” | Do not promise ONVIF speaker/talk. |
| TP-Link FAQ 4465: https://www.tp-link.com/us/support/faq/4465/ | “For remote RTSP access, a VPN is the recommended approach.” | Tunnel/VPN, not public port forward. |
| TP-Link community SD guidance | “Tapo cameras only support the FAT32 Format only.” / “formatting any SD card will result in a complete loss of the data on the Card.” | Format warning is destructive; backup first. |
| Tapo installation guide: https://www.tp-link.com/us/document/106984/ | “You can go to Camera Settings > microSD Card in the Tapo app to check the card status or format your card.” | Explains why the warning appears even after teammate “formatted” elsewhere. |

---

## Insufficient evidence / do not claim

- No source supports clinical fever diagnosis from MLX90640 alone.
- No source says thermal SR creates new radiometric truth; it reconstructs visual detail under assumptions.
- No source supports reliable individual pig ID from our current single RGB camera without tags/depth/model training.
- Current CCTV camera is offline `[M]`; no fresh frame exists.
- Vercel 402 `[M]` cause is unverified.
