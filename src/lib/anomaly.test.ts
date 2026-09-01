import {describe,expect,it} from 'vitest'
import {ANOMALY_RECOVERY_Z,ANOMALY_TRIGGER_Z,classifyAnomaly} from './anomaly'

describe('anomaly hysteresis',()=>{
  it('does not trigger inside the warning threshold',()=>{expect(classifyAnomaly(105,100,2).severity).toBeNull()})
  it('triggers warning at the configured boundary',()=>{expect(classifyAnomaly(111,100,2).severity).toBe('warning')})
  it('requires a materially smaller deviation to recover',()=>{expect(ANOMALY_RECOVERY_Z).toBeLessThan(ANOMALY_TRIGGER_Z);expect(classifyAnomaly(105,100,2).deviation).toBeLessThan(ANOMALY_RECOVERY_Z)})
  it('classifies drops separately',()=>{expect(classifyAnomaly(20,100,1).type).toBe('traffic_drop');expect(classifyAnomaly(800,100,1).type).toBe('traffic_spike')})
})
