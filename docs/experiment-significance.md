# Experiment significance

`GET /api/links/:code/experiment?days=30&goalId=&control=&confidence=0.95`

Treats the link's enabled routing rules as variants. Per variant: human clicks, unique converting visitors (distinct visitor hash, falling back to the event id), rate, Wilson 95% interval, relative lift and two-sided p-value versus the control (pooled two-proportion z-test).

- Control defaults to the variant with the most clicks; override with `control=<ruleId>`.
- No verdict until every variant has 100 clicks and there are 10 conversions overall (`insufficient_data`).
- `winner` requires significance at `confidence` (0.8–0.999) and that no other variant significantly beats it; the control can win.
- Auth is the same as other link endpoints (session or API key with access to the link). Promote the winner with `POST /api/links/:code/promote`.

`POST /api/links/:code/promote` accepts `requireWinner: true`; it then returns 409 unless this report names the rule the significant winner. The analytics panel always sends it.

UI: the analytics page shows an Experiment significance panel (window and confidence selectors, CI table, promote button for a winner).
