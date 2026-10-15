# Click goals

Set a click target and deadline per link and see pacing (achieved / on track / behind / missed).

- `GET /api/links/:code/click-target` returns target, deadline and progress (percent, remaining, required vs actual clicks per day, projection).
- `PUT /api/links/:code/click-target` with `{ "target": 5000, "deadline": "2026-12-01T00:00:00Z" }`. Target is an integer 1..1,000,000,000; the deadline must be in the future. Rate limited, audited as `link.click_target.set`.
- `DELETE` clears the goal (`link.click_target.clear`).
- UI: the "Click goal" action on each link card.
