export type CircuitState = { failures:number; openedUntil:number }
export class CircuitBreaker {
  private state: CircuitState={failures:0,openedUntil:0}
  constructor(private threshold=5,private cooldownMs=30_000){}
  canRequest(now=Date.now()){return this.state.openedUntil<=now}
  success(){this.state={failures:0,openedUntil:0}}
  failure(now=Date.now()){this.state.failures++;if(this.state.failures>=this.threshold)this.state.openedUntil=now+this.cooldownMs}
  snapshot(){return {...this.state}}
}
export class Bulkhead {
  private active=0
  constructor(private maxConcurrent=10){}
  async run<T>(fn:()=>Promise<T>):Promise<T>{if(this.active>=this.maxConcurrent)throw new Error('Bulkhead capacity exceeded');this.active++;try{return await fn()}finally{this.active--}}
  getActive(){return this.active}
}
export function exponentialBackoff(attempt:number,baseMs=1000,maxMs=300_000,jitter=0.2,random=Math.random){const raw=Math.min(maxMs,baseMs*2**Math.max(0,attempt-1));const spread=raw*jitter;return Math.max(0,Math.round(raw-spread+random()*2*spread))}
