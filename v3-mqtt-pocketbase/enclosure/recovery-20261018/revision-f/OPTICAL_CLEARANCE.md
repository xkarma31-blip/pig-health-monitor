# Optical clearance calculation — provisional lens placement, not physical test

Final F optical windows are 46×26mm. Optical half-widths are 23mm horizontal,
13mm vertical. For an ideal point pupil centered behind a thin rectangular stop,
a 110°×75° cone requires:

- Horizontal: setback ≤ 23 / tan(55°) = 16.10mm.
- Vertical: setback ≤ 13 / tan(37.5°) = 16.94mm.

Thus even ideal centered placement must be within ~16.1mm of the most restrictive
stop. Actual pupil radius, board position, tilt, hood thickness and chamfer reduce
this allowance. A PCB at the tub floor ~30mm behind the aperture WILL vignette
such a cone. Never call the wide FOV preserved just because there is a hole.

Thermal tub is 14mm deep, separator plate 3mm, wedge roof extends 10.91–21.09mm
above its base. Optical center stack goes out to ~33mm from rear; a lens located
near the separator plate center can be ~16mm behind roof, borderline even before
finite aperture and 15° mismatch. Carrier straps alone do not establish this.

For a functional optical prototype, raise/tilt the actual breakout so its optical
axis follows the hood normal, and keep the pupil near the final aperture (target
≤5mm behind it for generous ideal geometric margin). Exact bracket geometry needs
the fitted breakout and pupil location. Ordinary glass/plastic cannot be presumed
LWIR-transparent. Current digital prototype is NOT an optical performance release.

Next mechanical iteration should provide an adjustable raised/tilted sensor cradle
with defined lens target, not merely claim this calculation validates the layout.
