import {describe,it,expect,vi} from 'vitest'
import {CircuitBreaker,Bulkhead,exponentialBackoff} from './resilience'
import {assertGraphQLSafe,queryHash,registerPersistedQuery,resolvePersistedQuery,__resetPersistedQueriesForTests} from './graphql-security'
import {getFeatureFlag} from './feature-flags'
import {verifyWebhookSignature,generateWebhookSignature} from './webhooks'

describe('resilience primitives',()=>{
 it('opens circuit after threshold and recovers after cooldown',()=>{const c=new CircuitBreaker(2,100);expect(c.canRequest(0)).true;c.failure(0);expect(c.canRequest(0)).true;c.failure(0);expect(c.canRequest(50)).false;expect(c.canRequest(101)).true;c.success();expect(c.snapshot()).toEqual({failures:0,openedUntil:0})})
 it('bulkhead rejects excess concurrency and always releases slots',async()=>{const b=new Bulkhead(1);let release!:()=>void;const wait=new Promise<void>(r=>release=r);const first=b.run(async()=>{await wait;return 1});await expect(b.run(async()=>2)).rejects.toThrow('Bulkhead capacity exceeded');release();await expect(first).resolves.toBe(1);expect(b.getActive()).toBe(0)})
 it('backoff is bounded and jittered deterministically',()=>{expect(exponentialBackoff(1,100,500,0,()=>.5)).toBe(100);expect(exponentialBackoff(10,100,500,0,()=>.5)).toBe(500)})
})
describe('GraphQL query controls',()=>{it('hashes and persists normalized queries',()=>{__resetPersistedQueriesForTests();const q='{ me }';const h=registerPersistedQuery(q);expect(h).toBe(queryHash(q));expect(resolvePersistedQuery(h)).toBe(q)});it('rejects excessive depth',()=>{expect(()=>assertGraphQLSafe('{ a { b { c { d { e { f { g { h { i } } } } } } } } }')).toThrow(/depth/)});it('rejects excessive cost',()=>{expect(()=>assertGraphQLSafe('{ '+Array.from({length:90},(_,i)=>`f${i}: me`).join(' ')+' }')).toThrow(/cost/)})})
describe('Webhook security contract',()=>{it('requires exact HMAC bytes',()=>{const p='{"event":"link.clicked"}',s='secret';const sig=generateWebhookSignature(p,s);expect(verifyWebhookSignature(p,s,sig)).true;expect(verifyWebhookSignature(p+' ',s,sig)).false;expect(verifyWebhookSignature(p,s,sig.slice(0,-2))).false})})
