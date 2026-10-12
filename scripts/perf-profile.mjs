// Seeds a synthetic workspace with N clicks on real Postgres and times the analytics
// breakdown query (EXPLAIN ANALYZE). Usage:
//   DATABASE_URL=... node scripts/perf-profile.mjs [clicks=200000] [--no-seed]
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const clicks = Number(process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : 200000)
const seed = !process.argv.includes('--no-seed')
const run = (sql, ...a) => prisma.$executeRawUnsafe(sql, ...a)

if (seed) {
  await run(`DELETE FROM workspaces WHERE slug = 'perf-ws'`)
  await run(`INSERT INTO workspaces (id, name, slug, "updatedAt") VALUES ('perf-ws-id','Perf','perf-ws',now())`)
  await run(`INSERT INTO urls (id,"originalUrl","shortCode","workspaceId","updatedAt",tags)
    SELECT 'perf-u-'||g,'https://example.com/'||g,'perf'||g,'perf-ws-id',now(),ARRAY['t'||(g%7)] FROM generate_series(1,500) g`)
  await run(`INSERT INTO click_events (id,"urlId",country,"deviceType","referrerHost","trafficType","createdAt")
    SELECT 'perf-c-'||g,'perf-u-'||(1+floor(power(random(),2.5)*500))::int,
      (ARRAY['US','IN','DE','BR','GB','FR','JP','CA'])[1+(g%8)],
      (ARRAY['desktop','mobile','tablet'])[1+(g%3)]::"DeviceType",
      (ARRAY['google.com','t.co','news.ycombinator.com','facebook.com',NULL])[1+(g%5)],
      'human', now() - (random()*interval '60 days')
    FROM generate_series(1,$1) g`, clicks)
  await run(`ANALYZE click_events`)
}

const q = (col) => `EXPLAIN (ANALYZE, FORMAT TEXT) SELECT ${col} AS key, COUNT(*)::bigint AS clicks
  FROM click_events c JOIN urls u ON u.id = c."urlId"
  WHERE u."workspaceId" = 'perf-ws-id' AND c."createdAt" >= now() - interval '30 days' AND c."trafficType"='human'
  GROUP BY 1 ORDER BY 2 DESC LIMIT 10`
for (const col of ['c.country', 'c."referrerHost"']) {
  const rows = await prisma.$queryRawUnsafe(q(col))
  const lines = rows.map((r) => r['QUERY PLAN'])
  console.log(`--- ${col}\n` + lines.filter((l) => /Scan|Execution|Planning/.test(l)).join('\n'))
}
await prisma.$disconnect()
