import fs from 'node:fs'
// Shared production SLO with the k6 scripts (smoke/soak hold p95 redirect
// latency; soak holds the error rate): p95 <= 500ms, error rate <= 0.1%.
const SLO = { p95Ms: 500, errorRate: 0.001 }
const files=process.argv.slice(2);if(!files.length)process.exit(0)
const summaries=files.map(f=>JSON.parse(fs.readFileSync(f,'utf8')));const rows=summaries.map((s,i)=>{const d=s.metrics||{};const h=d.http_req_duration?.values||{};const r=d.http_reqs?.values||{};const e=d.http_req_failed?.values||{};const rate=r.rate||0;const p95=h['p(95)']||0;const p99=h['p(99)']||0;const errorRate=e.rate||0;const budget=SLO.errorRate;return {file:files[i],requestsPerSecond:Number(rate.toFixed(2)),p95Ms:Number(p95.toFixed(2)),p99Ms:Number(p99.toFixed(2)),errorRate:Number(errorRate.toFixed(5)),meetsSlo:p95<=SLO.p95Ms&&errorRate<=SLO.errorRate,errorBudgetRemaining:Number(Math.max(0,budget-errorRate).toFixed(5))}});console.log(JSON.stringify({generatedAt:new Date().toISOString(),slo:{p95Ms:SLO.p95Ms,errorRate:SLO.errorRate},assumptions:{targetErrorRate:SLO.errorRate,capacityRule:'sustain the highest tested RPS while p95 <= 500ms and error rate <= 0.1%'},runs:rows},null,2));
