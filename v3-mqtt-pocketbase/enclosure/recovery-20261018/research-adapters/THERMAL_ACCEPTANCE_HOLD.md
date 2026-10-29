# Thermal acceptance hold

The latest builder's six mechanical gates are insufficient for release.
Independent review (`thermal-larger-independent-review.txt`) found absent
cradle-to-insert contact verification, missing finite washer and nominal
hardware envelopes, incomplete retainer fastener/load-path checks, and loose
PCB bearing-ray height acceptance. Existing passing JSON is diagnostic, not
proof of an installable thermal assembly. Do not promote its STLs yet.

Required repair: explicit finite bearing into the actual cradle, nominal
M3/M2 mounting interfaces including heads/shafts/access, finite PCB/retainer
contact, and relevant hardware included in conditional optical checks.
The smallest seat repair and a standalone installed-interface checker are
being kept in separate files until their changes can be integrated safely.
P remains unchanged. Physical device measurements are not the reason for
this hold: these are missing or defective digital engineering checks.
