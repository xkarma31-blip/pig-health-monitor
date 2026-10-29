# Research-to-design decisions

## Retain

- Open external SHT carrier: supports environmental exposure and avoids enclosing
  sensor with warm electronics. Does not guarantee representative sampling.
- Rectangular thermal aperture: avoids ungrounded circular decorative restriction.
- Measured-in-CAD fastener seats and clearance notches,with provisional hardware
  limits and no physical-fit claims.
- Source artwork rather than substitute font/logo. Original reference preserved.

## Correct interpretation,not geometry without hardware

- Nominal thermal FOV is not a hard cutoff; prior centered-ray result is NOT
  sensor placement approval. Angular and offset sweeps expose16mm sensitivity.
- Microphone carrier is retention only,NOT a completed acoustic interface.
  Bottom-port alignment,short controlled gasket path and response tests required.
- Open SHT bracket is not chemical/dust/water protection. Do not add arbitrary
  membrane and claim unchanged humidity response.
- Dark fasteners are optional visual finish,not purchased corrosion-safe hardware.

## Do not implement blindly

Do not shrink mic case holes to manufacturer PCB-hole examples,apply PDM wiring
advice to INMP441 I2S,select gasket thickness from chip package dimensions,enlarge
hood for an invented pupil position,or label PETG/open apertures IP-rated.

## Remaining external validation

Actual board identity/dimensions,pupil and sound-port location,fasteners,printer
and installation environment must be measured. No real print,test assembly or
sensor comparison occurred. Further generic web research cannot replace these.
Digital work can continue on independently demonstrated defects; speculative
geometry changes without those inputs risk harming the intended function.
