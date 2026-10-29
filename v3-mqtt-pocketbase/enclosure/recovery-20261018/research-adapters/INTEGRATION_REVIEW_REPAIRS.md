# Final integration-review repairs

The independent final review is preserved in `integrated-final-review.txt`.

- Thermal expected printed inventory now explicitly names carrier and two
  retainers, not whichever tags remain in the tested scene. Deleting each of
  these three objects in memory returned exit1 and a fresh missing-object JSON.
  Negative reports are preserved as `negative-missing-pcb25_4square*.json`.
- Builder rejects missing entries in the independent thermal source metadata.
- Combined-mode mic checks no longer repair transforms before testing them.
  A1mm displacement on each side returned exit1; restored workflow passed.
- Six thermal nonprintable instances and all manufacturing-instance bindings
  require an independent geometry/export contract; implementation in progress.
- Explicit wire and tie route reservations are being evaluated separately;
  sampled straight tunnel rays are not a full retention route or cable fit.

Until the contract and route checks complete, the previous fresh-unpack pass
is valid evidence for that archived version only, not final goal completion.
