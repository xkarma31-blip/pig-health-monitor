# Initial rail coupons rejected for installation

Independent source audit found: large mic rails provide zero-area bearing to a
14×12 PCB; large SHT rails miss a12×12 PCB; mic end bridge crosses existing
radius6 acoustic keep-out; SHT bridge overlaps carrier fastener region. Small
variants added during that audit address footprint only, not base capture/path.

All four initial coupons remain experimental artifacts, NOT approved adapters.
Do not print/install them as the solution. Their manifold checks prove neither
support nor acoustic/airflow clearance. Preserve them to document the failed
approach rather than relabeling it as completed integration.

Replacement direction: independent carrier-specific bases with replaceable
inward contact shoes; small PCB edges must bear on positive area while keeping
an explicitly narrower, locally controlled acoustic path. Existing12mm bore
does not imply every point within it must be the actual board-port diameter,
but any reduction must be intentional and acoustically tested, not accidental.
Do not adopt guessed port centers as actual board measurements.
