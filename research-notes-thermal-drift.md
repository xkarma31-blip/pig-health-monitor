# Thermal ROI & Drift Compensation — Research Notes

## Ear Base as Primary ROI

- Responds quickly to core temperature changes
- Less insulated by fat than the body

**Critical caveat:** The ear base is still affected by ambient temperature. Jia et al. found a correlation coefficient of **0.26** between ear root temperature and air temperature. Ambient compensation cannot be ignored even with the best ROI.

## Drift Compensation — Non-Negotiable for Low-Cost Sensors

Jiao & Jiao (2022) [1] showed that uncooled cameras (like the MLX90640) drift **>2°C in 80 seconds** as the camera heats up. This is a hardware-level issue requiring active compensation strategies.

---

## References

[1] Jiao & Jiao (2022) — Uncooled thermal camera drift characteristics
