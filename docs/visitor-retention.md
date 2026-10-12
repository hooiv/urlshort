# New vs returning visitors

`GET /api/analytics/:shortCode/visitors?days=30` (1–365; session or API key with `analytics:read`/`links:read`).

Counts distinct `visitorIdHash` values among human clicks in the window. A visitor is *returning* if they clicked the link on more than one UTC day inside the window or at any time before it. Clicks with no hash (privacy mode / consent denied) are reported as `anonymousClicks` and excluded from the split. Response: `uniqueVisitors, newVisitors, returningVisitors, returningRate, clicksPerVisitor, anonymousClicks`. Shown on the link analytics page.
