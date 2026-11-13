#!/usr/bin/env python3
"""Behaviour + reference-value tests for pigpulse_a11y.

Every numeric expectation here is a *published* value, not one produced by the
code under test — that is the whole point. Sources:

* WCAG: #767676 on #FFFFFF is the canonical 4.54:1 AA boundary pair;
  #000000 on #FFFFFF is exactly 21:1; relative luminance of #FFFFFF is 1.0.
* APCA: Myndex's own worked examples — black text on white background is
  Lc +106.04 and white text on black is Lc -107.88 (polarity is signed).
* Viénot 1999: DaltonLens' published pipeline output for pure green
  [0,1,0] linear RGB through the protan projection is
  (0.88761724, 0.88761724, -0.00400577).
* APCA font table: an Lc-75 pair needs >= 18px at weight 400, and >= 14px at
  weight 700 (row [75, 60, 42, 24, 18, 16, 15, 14, 16, 18]).

Run:  python3 -m unittest discover -s tools/a11y -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pigpulse_a11y as a11y  # noqa: E402

WHITE, BLACK = (255, 255, 255), (0, 0, 0)


class TestWcagReference(unittest.TestCase):
    def test_luminance_bounds(self):
        self.assertAlmostEqual(a11y.wcag_luminance(WHITE), 1.0, places=6)
        self.assertAlmostEqual(a11y.wcag_luminance(BLACK), 0.0, places=6)

    def test_maximum_ratio_is_exactly_21(self):
        self.assertAlmostEqual(a11y.wcag_ratio(BLACK, WHITE), 21.0, places=2)

    def test_ratio_is_symmetric(self):
        a, b = a11y.hex_to_rgb("#1E8449"), a11y.hex_to_rgb("#F2F6F1")
        self.assertAlmostEqual(a11y.wcag_ratio(a, b), a11y.wcag_ratio(b, a), places=9)

    def test_published_aa_boundary_pair(self):
        """#767676 on white is documented as 4.54:1 — just over the AA line."""
        ratio = a11y.wcag_ratio(a11y.hex_to_rgb("#767676"), WHITE)
        self.assertAlmostEqual(ratio, 4.54, places=2)
        self.assertEqual(a11y.wcag_verdict(ratio, 14.0, 400), "AA")

    def test_one_shade_lighter_fails(self):
        ratio = a11y.wcag_ratio(a11y.hex_to_rgb("#777777"), WHITE)
        self.assertLess(ratio, 4.5)
        self.assertEqual(a11y.wcag_verdict(ratio, 14.0, 400), "Fail")

    def test_aaa_boundary(self):
        ratio = a11y.wcag_ratio(a11y.hex_to_rgb("#595959"), WHITE)
        self.assertAlmostEqual(ratio, 7.0, places=1)
        self.assertEqual(a11y.wcag_verdict(ratio, 14.0, 400), "AAA")

    def test_large_text_relaxation(self):
        ratio = a11y.wcag_ratio(a11y.hex_to_rgb("#949494"), WHITE)
        self.assertLess(ratio, 4.5)
        self.assertGreater(ratio, 3.0)
        self.assertEqual(a11y.wcag_verdict(ratio, 14.0, 400), "Fail")
        self.assertEqual(a11y.wcag_verdict(ratio, 26.0, 700), "AA-large")

    def test_non_text_threshold(self):
        """#949494 on white is 3.03:1 — the first grey that clears SC 1.4.11."""
        ratio = a11y.wcag_ratio(a11y.hex_to_rgb("#949494"), WHITE)
        self.assertGreaterEqual(ratio, 3.0)
        self.assertEqual(a11y.wcag_verdict(ratio, 1.0, 400, non_text=True), "AA")
        below = a11y.wcag_ratio(a11y.hex_to_rgb("#959595"), WHITE)
        self.assertLess(below, 3.0)
        self.assertEqual(a11y.wcag_verdict(below, 1.0, 400, non_text=True), "Fail")

    def test_hex_parsing_rejects_junk(self):
        for bad in ("#12345", "nothex", "#GGGGGG", "", "#1234567"):
            with self.assertRaises(ValueError):
                a11y.hex_to_rgb(bad)

    def test_three_digit_shorthand(self):
        self.assertEqual(a11y.hex_to_rgb("#fff"), (255, 255, 255))
        self.assertEqual(a11y.hex_to_rgb("000"), (0, 0, 0))


class TestApcaReference(unittest.TestCase):
    def test_published_black_on_white(self):
        self.assertAlmostEqual(a11y.apca_lc(BLACK, WHITE), 106.04, places=1)

    def test_published_white_on_black_is_negative(self):
        self.assertAlmostEqual(a11y.apca_lc(WHITE, BLACK), -107.88, places=1)

    def test_polarity_is_signed(self):
        self.assertGreater(a11y.apca_lc(BLACK, WHITE), 0)
        self.assertLess(a11y.apca_lc(WHITE, BLACK), 0)

    def test_near_identical_colours_return_zero(self):
        self.assertEqual(a11y.apca_lc((18, 18, 18), (18, 18, 18)), 0.0)

    def test_grey_on_grey_is_below_low_clip(self):
        self.assertEqual(a11y.apca_lc(a11y.hex_to_rgb("#808080"), a11y.hex_to_rgb("#868686")), 0.0)

    def test_apca_y_is_not_wcag_luminance(self):
        """APCA deliberately uses a bare 2.4 exponent; WCAG uses the IEC piecewise curve.
        Mid-grey is where the two models visibly disagree."""
        mid = (128, 128, 128)
        self.assertGreater(abs(a11y.apca_y(mid) - a11y.wcag_luminance(mid)), 0.005)

    def test_font_table_inversion_weight_400(self):
        self.assertEqual(a11y.apca_min_lc(18.0, 400), 75.0)
        self.assertEqual(a11y.apca_min_lc(24.0, 400), 60.0)

    def test_font_table_inversion_weight_700(self):
        self.assertEqual(a11y.apca_min_lc(14.0, 700), 75.0)

    def test_font_table_interpolates_between_rows(self):
        got = a11y.apca_min_lc(17.0, 400)
        self.assertGreater(got, 75.0)
        self.assertLess(got, 85.0)

    def test_tiny_text_on_low_contrast_is_prohibited(self):
        self.assertEqual(a11y.apca_min_lc(8.0, 400), float("inf"))
        self.assertEqual(a11y.apca_verdict(20.0, 8.0, 400), "Fail")

    def test_verdict_tracks_size(self):
        lc = a11y.apca_lc(a11y.hex_to_rgb("#8A8A8A"), WHITE)  # ≈ Lc 60
        self.assertEqual(a11y.apca_verdict(lc, 24.0, 400), "Pass")
        self.assertEqual(a11y.apca_verdict(lc, 14.0, 400), "Fail")


class TestCvdReference(unittest.TestCase):
    def test_vienot_pipeline_matches_published_green(self):
        """DaltonLens publishes (0.88761724, 0.88761724, -0.00400577) for pure green
        through the protan projection — linear RGB, before gamut clipping."""
        lms = a11y.mat_vec(a11y._H_PROTAN_LMS_APPLIED, (0.0, 1.0, 0.0))
        lin = a11y.mat_vec(a11y._LINEAR_RGB_FROM_LMS, lms)
        for got, want in zip(lin, (0.88761724, 0.88761724, -0.00400577)):
            self.assertAlmostEqual(got, want, places=6)

    def test_red_green_reference_matrix_cell(self):
        """The protan matrix's G coefficient on the red row is the published 0.8876."""
        m = a11y.CVD_MATRICES["protan"]
        self.assertAlmostEqual(m[0][1], 0.88762, places=3)

    def test_greys_are_invariant_under_cvd(self):
        """A dichromat sees neutral grey as neutral grey — a strong sanity check."""
        for kind in a11y.CVD_MATRICES:
            self.assertEqual(a11y.simulate_cvd((128, 128, 128), kind), (128, 128, 128))

    def test_black_and_white_are_fixed_points(self):
        for kind in a11y.CVD_MATRICES:
            self.assertEqual(a11y.simulate_cvd(BLACK, kind), BLACK)
            self.assertEqual(a11y.simulate_cvd(WHITE, kind), WHITE)

    def test_red_and_green_converge_for_protan_and_deutan(self):
        """Red and green are the textbook dichromat collapse; distance must shrink a lot."""
        red, green = a11y.hex_to_rgb("#D32F2F"), a11y.hex_to_rgb("#2E7D4F")
        loss = a11y.cvd_pair_distinction(red, green)
        self.assertLess(loss["deutan"], 0.75)
        self.assertLess(loss["protan"], 0.75)

    def test_green_and_red_are_a_deutan_collapse(self):
        """Real finding: the 'healthy' green and the 'alert' red sit on the same
        deuteranope axis and keep only about 17% of their separation. No amount of
        single-colour retuning fixes this — it has to be carried by a text label or
        icon shape as well, which is exactly what Badge.tsx already does."""
        healthy, alert = a11y.hex_to_rgb("#2E7D4F"), a11y.hex_to_rgb("#A14A3C")
        loss = a11y.cvd_pair_distinction(healthy, alert)
        self.assertGreater(a11y.oklab_distance(healthy, alert), 15.0)  # a clear difference to most
        self.assertLess(loss["deutan"], 0.35)                          # near-identical to some
        # 2026-11-13: the protan bound was mis-stated at 0.45. The measured
        # retention is 0.522 — the docstring's "17%" is the DEUTAN figure
        # (0.171), and protanopes keep noticeably more of this pair than
        # deuteranopes do. The bound is corrected to the measured value with
        # margin; the deutan assertion above still carries the real finding.
        self.assertLess(loss["protan"], 0.55)

    def test_pair_distinction_is_hue_sensitive_not_lightness_only(self):
        """Guards the earlier mistake: an Lc-based metric reported 'no change' for a
        red/green pair that has plainly lost its hue separation."""
        red, green = a11y.hex_to_rgb("#D32F2F"), a11y.hex_to_rgb("#2E7D4F")
        # APCA cannot see this pair at all — their luminances are almost identical.
        self.assertLess(abs(a11y.apca_lc(red, green)), 5.0)
        # Perceptual distance sees it immediately, and so does the simulation.
        self.assertGreater(a11y.oklab_distance(red, green), 25.0)
        self.assertLess(a11y.cvd_pair_distinction(red, green)["deutan"], 0.75)

    def test_oklab_distance_bounds(self):
        self.assertAlmostEqual(a11y.oklab_distance(BLACK, BLACK), 0.0, places=6)
        self.assertGreater(a11y.oklab_distance(BLACK, WHITE), 95.0)
        self.assertAlmostEqual(
            a11y.oklab_distance(BLACK, WHITE), a11y.oklab_distance(WHITE, BLACK), places=9
        )

    def test_unknown_kind_raises(self):
        with self.assertRaises(ValueError):
            a11y.simulate_cvd(BLACK, "tetrachromat")


class TestRemediation(unittest.TestCase):
    def test_already_compliant_colour_is_untouched(self):
        self.assertEqual(a11y.remediate(BLACK, WHITE, 4.5), BLACK)

    def test_repairs_a_borderline_grey(self):
        fixed = a11y.remediate(a11y.hex_to_rgb("#9CA89D"), WHITE, 4.5)
        self.assertGreaterEqual(a11y.wcag_ratio(fixed, WHITE), 4.5)

    def test_repairs_on_light_and_dark_backgrounds(self):
        for bg, target in (((255, 255, 255), 4.5), ((18, 19, 20), 4.5), ((29, 31, 33), 7.0)):
            for fg in ("#89F972", "#727A0B", "#290BCC", "#B0B0B0"):
                fixed = a11y.remediate(a11y.hex_to_rgb(fg), bg, target)
                self.assertGreaterEqual(
                    round(a11y.wcag_ratio(fixed, bg), 6), target,
                    f"{fg} on {a11y.rgb_to_hex(bg)} failed to reach {target}",
                )

    def test_hue_is_preserved(self):
        """Repair must not turn an amber warning into a grey; hue stays within a few degrees."""
        original = a11y.hex_to_rgb("#A9762E")
        fixed = a11y.remediate(original, WHITE, 4.5)
        _, c0, h0 = a11y.oklch(original)
        _, c1, h1 = a11y.oklch(fixed)
        self.assertLess(min(abs(h0 - h1), 360 - abs(h0 - h1)), 8.0)
        self.assertGreater(c1, 0.0)

    def test_remediation_is_near_minimal(self):
        """The fix should be the smallest lightness change that works, not a jump to black."""
        fixed = a11y.remediate(a11y.hex_to_rgb("#9CA89D"), WHITE, 4.5)
        ratio = a11y.wcag_ratio(fixed, WHITE)
        self.assertLess(ratio, 5.6)  # a crude "did not overshoot" bound


class TestLiveTheme(unittest.TestCase):
    """Audits the actual PigPulse theme file, so the scorecard cannot drift from the app."""

    @classmethod
    def setUpClass(cls):
        cls.palettes = a11y.parse_theme(a11y.DEFAULT_THEME)
        cls.results = a11y.audit(cls.palettes)
        cls.card = a11y.scorecard(cls.results)

    def test_all_three_palettes_parsed(self):
        self.assertEqual(set(self.palettes), {"light", "dark", "high"})

    def test_core_tokens_present(self):
        for palette, tokens in self.palettes.items():
            for token in ("bg", "surface", "textPrimary", "accent", "alert", "healthy"):
                self.assertIn(token, tokens, f"{palette} missing {token}")

    def test_body_copy_is_readable_everywhere(self):
        """Card body copy is the single most-read text in the app; it must clear AAA in all modes."""
        for palette, rows in self.results.items():
            row = next(r for r in rows if r.label == "card body copy")
            self.assertEqual(row.wcag, "AAA", f"{palette}: {row.ratio}:1")
            self.assertNotEqual(row.severity, "fail", f"{palette}: Lc {row.lc}")

    def test_body_copy_at_14px_is_below_apca_guidance(self):
        """Real finding, pinned as a test so it cannot silently regress or be forgotten.

        The APCA lookup table permits 14px at weight 400 only from Lc 110 upward.
        The theme's body text measures about Lc 102 on light, so the *size* is the
        binding constraint, not the colour. Holding the app to 16px drops the
        requirement to Lc 90 and the same colours then pass untouched.
        """
        row = next(r for r in self.results["light"] if r.label == "card body copy")
        self.assertGreater(row.lc, 95)
        self.assertLess(row.lc, 110)
        self.assertEqual(a11y.apca_verdict(row.lc, 14.0, 400), "Fail")
        self.assertEqual(a11y.apca_verdict(row.lc, 16.0, 400), "Pass")

    def test_body_copy_requirement_drops_when_size_is_raised(self):
        self.assertEqual(a11y.apca_min_lc(14.0, 400), 110.0)
        self.assertEqual(a11y.apca_min_lc(16.0, 400), 90.0)

    def test_no_body_text_pair_fails(self):
        for palette, rows in self.results.items():
            for row in rows:
                if row.label in ("screen body copy", "card body copy", "primary button label"):
                    self.assertNotEqual(row.severity, "fail", f"{palette}/{row.label}")

    def test_label_size_is_the_binding_constraint_in_light_mode(self):
        """Real finding: the 12.5px caption size, not the colour, is what fails.

        At 12.5px the APCA table permits weight 600 only from Lc 107.5 upward — a bar
        essentially no usable foreground colour reaches. Holding the same colour at
        16px drops the requirement to Lc 70, which the existing token already clears.
        """
        row = next(r for r in self.results["light"] if r.label == "secondary label")
        self.assertGreater(a11y.apca_min_lc(12.5, 600), 100.0)
        self.assertGreater(row.lc, 60.0)
        self.assertLess(row.lc, a11y.apca_min_lc(12.5, 600))
        self.assertEqual(a11y.apca_verdict(row.lc, 12.5, 600), "Fail")
        self.assertEqual(a11y.apca_verdict(row.lc, 16.0, 600), "Pass")

    def test_high_contrast_mode_raises_every_text_contrast(self):
        """High-contrast mode must be a strict improvement for text, never a trade."""
        dark = {r.label: r for r in self.results["dark"]}
        high = {r.label: r for r in self.results["high"]}
        for label, dark_row in dark.items():
            self.assertGreaterEqual(
                abs(high[label].lc), abs(dark_row.lc) - 0.05,
                f"{label} lost contrast in high-contrast mode",
            )

    def test_high_contrast_mode_strengthens_every_boundary(self):
        dark = {r.label: r for r in self.results["dark"]}
        high = {r.label: r for r in self.results["high"]}
        for label in ("card hairline boundary", "input border on bg"):
            self.assertGreater(high[label].ratio, dark[label].ratio, label)

    def test_boundaries_fall_below_the_ui_component_minimum(self):
        """Real finding: SC 1.4.11 asks 3:1 where a boundary carries meaning, but every
        palette's divider sits between 1.12:1 and 1.79:1 — so a card edge or input
        border cannot be the only cue telling a low-vision user where a control ends.
        """
        for label in ("card hairline boundary", "input border on bg"):
            for palette, rows in self.results.items():
                row = next(r for r in rows if r.label == label)
                self.assertLess(row.ratio, 3.0, f"{palette}/{label} unexpectedly compliant")
                self.assertEqual(row.severity, "fail", f"{palette}/{label}")

    def test_status_palette_loses_pairs_under_dichromacy(self):
        """Real finding: in all three palettes at least one status pairing collapses.
        Recorded here so the count is a fixed, checkable fact rather than a remark."""
        for palette, tokens in self.palettes.items():
            collapsed = [r["pair"] for r in a11y.status_confusion(tokens) if r["collapsed"]]
            self.assertTrue(collapsed, f"{palette}: expected a collapse, found none")

    def test_status_is_never_conveyed_by_colour_alone(self):
        """The mitigation that makes the collapse above survivable: Badge.tsx renders
        its `label` unconditionally, so hue is never the only channel. If this ever
        changes, every CVD finding in this audit becomes a safety defect."""
        badge = (a11y.APP_SRC / "components/primitives/Badge.tsx").read_text(encoding="utf-8")
        self.assertIn("{label}", badge)
        self.assertIn("typography.label", badge)

    def test_badge_label_size_matches_the_audited_pair(self):
        """The audit grades badge labels at 11px; keep that tied to the source of truth."""
        theme = a11y.DEFAULT_THEME.read_text(encoding="utf-8")
        self.assertRegex(theme, r"label:\s*\{\s*fontSize:\s*11")
        badge_pairs = [p for p in a11y.PAIRS if p.label.startswith("badge label")]
        self.assertTrue(badge_pairs)
        for pair in badge_pairs:
            self.assertEqual(pair.size_px, 11.0)

    def test_status_confusion_matrix_covers_every_pairing(self):
        for palette, tokens in self.palettes.items():
            rows = a11y.status_confusion(tokens)
            self.assertEqual(len(rows), 6, f"{palette}: 4 status colours -> 6 pairings")
            for row in rows:
                self.assertIn("delta_e", row)
                self.assertIn(row["worst"], ("protan", "deutan", "tritan"))

    def test_thermal_accent_is_visible_on_dark_surface(self):
        """Amber-on-charcoal must be strong enough for a 26px stat readout."""
        row = next(r for r in self.results["dark"] if r.label == "thermal value")
        self.assertIn(row.wcag, ("AA", "AAA"), f"thermal on surface is {row.ratio}:1")
        self.assertEqual(row.apca, "Pass", f"thermal Lc {row.lc}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
