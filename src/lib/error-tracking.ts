import { recordServerMetric } from '@/lib/observability'

export async function reportError(error: unknown, context: Record<string, unknown> = {}) {
  const message = error instanceof Error ? error.message : String(error)
  console.error('QuickLink error', { message, ...context })
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  try {
    const parsed = new URL(dsn)
    const projectId = parsed.pathname.replace(/^\//, '')
    const publicKey = parsed.username
    const host = `${parsed.protocol}//${parsed.host}`
    await fetch(`${host}/api/${projectId}/store/?sentry_version=7&sentry_key=${encodeURIComponent(publicKey)}&sentry_client=quicklink`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message,level:'error',tags:context,platform:'node',timestamp:Date.now()/1000}) , signal:AbortSignal.timeout(2000)}).catch(()=>{})
  } catch { /* observability must never take down a request */ }
}

export function timed<T extends (...args: never[]) => unknown>(name:string, fn:T):T {
  return (async (...args:Parameters<T>)=>{const started=performance.now();try{return await fn(...args)}catch(e){recordServerMetric(performance.now()-started,true);await reportError(e,{operation:name});throw e}finally{recordServerMetric(performance.now()-started,false)}}) as T
}