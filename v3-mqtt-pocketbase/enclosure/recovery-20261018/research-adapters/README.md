# Research-driven room and support experiments

Not an installed release. P enclosure assets remain preserved. No electronics
are printable parts; these STLs are candidate insulating supports only.

Sources: revision-p/COMPONENT_DIMENSION_RESEARCH.md, independent research reports
and raw fetched snapshots in source-evidence/ with SHA256 manifest. Raw vendor
HTML may include unrelated site content; quoted dimensions are documented in the
research ledger. Listings conflict; no actual user board identity is claimed.

Reservation experiments distinguish12mm compact wiring versus20mm socketed
stacks. ESP20mm scenario needs lower tray or deeper case; lowering tray3mm clears
printed meshes but requires a3mm spacer option, renewed bolt stack and board
insulation checks. Existing P tray remains unchanged. Thermal34×30mm planning
footprint accounts for SparkFun25.4mm square example; it does not certify optics.

Support coupons include large-envelope and smaller-board examples. They are NOT
universal adapters. Small mic supports may intrude into the existing radius6mm
sound corridor; they cannot be installed unchanged. All underside bearing zones,
base capture, wire exits and sensor paths need installed testing. A bridge below
a PCB is not acceptable if it blocks a real sensing port or contacts components.

Reproduce coupons: blender -b --python-exit-code 1 --python build_research_adapters.py
from parent directory.
Reservation test: check_component_reservations.py. Neither script approves
strength, actual fit, acoustic coupling, optical free-zone or humidity response.
