# Experiment significance

`GET /api/links/:code/experiment?days=30&goalId=&control=&confidence=0.95`

Treats the link's enabled routing rules as variants. Per variant: human clicks, unique converting visitors (distinct visitor hash, falling back to the event id), rate, Wilson 95% interval, relative lift and two-sided p-value versus the control (pooled two-proportion z-test).

- Control defaults to the variant with the most clicks; override with `control=<ruleId>`.
- No verdict until every variant has 100 clicks and there are 10 conversions overall (`insufficient_data`).
- `winner` requires significance at `confidence` (0.8–0.999) and that no other variant significantly beats it; the control can win.
- Auth is the same as other link endpoints (session or API key with access to the link). Promote the winner with `POST /api/links/:code/promote`.

`POST /api/links/:code/promote` accepts `requireWinner: true`; it then returns 409 unless this report names the rule the significant winner. The analytics panel always sends it.

UI: the analytics page shows an Experiment significance panel (window and confidence selectors, CI table, promote button for a winner).

## Sample-size planner

`GET /api/experiments/sample-size?baselineRate=0.05&minRelativeLift=0.2[&confidence&power&variants&dailyClicks]` returns clicks needed per variant (two-sided two-proportion test, Bonferroni-corrected for >2 variants, never below the report's 100-click floor) and an optional duration estimate. The analytics page shows it as the Experiment planner form under the significance panel.

`GET /api/experiments/sample-size?baselineRate=0.05&perVariantClicks=2000` (no `minRelativeLift`) returns the minimum detectable relative lift for the clicks you already have per variant, so you can tell whether a running test can still detect the effect you care about.

## Bayesian read-out

The experiment response includes `bayesian[]`: for each non-control variant, the probability it beats the control (Beta-Binomial posterior, seeded Monte Carlo so repeated calls give identical numbers) and the expected absolute loss in conversion rate if you ship it and it is actually worse.

## Stopping-rule decision

The response also carries `decision: { action, variantId, reason }`, one of:

- `ship_variant`: either the frequentist winner after the planned sample was collected, or P(beat control) ≥ 0.95 with expected loss ≤ 0.1 percentage points.
- `keep_control`: the control is the significant winner.
- `stop_no_effect`: the planned sample is reached with no significant difference.
- `keep_running`: not enough data yet. Frequentist winners are not trusted before the planned sample, which avoids peeking bias.

The analytics panel shows this as a banner and lets you ship a Bayesian-approved variant.
