import {beforeEach,describe,expect,it,vi} from 'vitest'

const {findUnique}=vi.hoisted(()=>({findUnique:vi.fn()}))
vi.mock('@/lib/prisma',()=>({prisma:{privacyPolicy:{findUnique}}}))

import {clearPrivacyCache,sanitizeAnalyticsMetadata,sanitizeClickForIngestion} from './privacy-ingestion'

describe('privacy ingestion',()=>{
  beforeEach(()=>{findUnique.mockReset();clearPrivacyCache()})

  it('hashes IP and visitor identifiers and strips disabled dimensions',async()=>{
    findUnique.mockResolvedValue({hashIp:true,hashVisitor:true,storeUserAgent:false,storeReferrer:false,aggregateOnly:false})
    const result=await sanitizeClickForIngestion({clickEventId:'c',urlId:'u',ip:'203.0.113.4',visitorIdHash:'visitor',userAgent:'secret ua',referer:'https://secret.example',referrerHost:'secret.example',country:'IN',dateKey:'2026-09-01',shortCode:'x'},'ws')
    expect(result?.ip).toHaveLength(64);expect(result?.visitorIdHash).toHaveLength(64);expect(result?.userAgent).toBeNull();expect(result?.referer).toBeNull();expect(result?.country).toBe('IN')
    expect(result?.ip).not.toBe('203.0.113.4');expect(result?.visitorIdHash).not.toBe('visitor')
  })

  it('drops IP rather than storing raw IP when hashing is disabled',async()=>{
    findUnique.mockResolvedValue({hashIp:false,hashVisitor:false,storeUserAgent:true,storeReferrer:true,aggregateOnly:false})
    const result=await sanitizeClickForIngestion({clickEventId:'c',urlId:'u',ip:'203.0.113.4',visitorIdHash:'visitor',dateKey:'2026-09-01',shortCode:'x'},'ws')
    expect(result?.ip).toBeNull();expect(result?.visitorIdHash).toBeNull()
  })

  it('removes all granular analytics fields in aggregate-only mode',async()=>{
    findUnique.mockResolvedValue({hashIp:true,hashVisitor:true,storeUserAgent:true,storeReferrer:true,aggregateOnly:true})
    const result=await sanitizeClickForIngestion({clickEventId:'c',urlId:'u',ip:'203.0.113.4',visitorIdHash:'visitor',country:'IN',deviceType:'mobile',trafficType:'human',aiAgent:'x',os:'android',browser:'chrome',language:'en',utmSource:'s',utmMedium:'m',utmCampaign:'c',utmTerm:'t',utmContent:'x',dateKey:'2026-09-01',shortCode:'x'},'ws')
    expect(result).toMatchObject({ip:null,country:null,deviceType:null,trafficType:'human',aiAgent:null,os:null,browser:null,language:null,utmSource:null,utmMedium:null,utmCampaign:null,utmTerm:null,utmContent:null,visitorIdHash:null})
  })

  it('sanitizes IP and visitor fields in conversion metadata too',async()=>{
    findUnique.mockResolvedValue({hashIp:true,hashVisitor:true,storeUserAgent:false,storeReferrer:false,aggregateOnly:false})
    const result=await sanitizeAnalyticsMetadata('ws',{ip:'203.0.113.4',visitorIdHash:'visitor',userAgent:'ua',referrerHost:'secret.example'})
    expect(result.ip).toHaveLength(64);expect(result.visitorIdHash).toHaveLength(64);expect(result).not.toHaveProperty('userAgent');expect(result).not.toHaveProperty('referrerHost')
  })

  it('drops clicks from excluded IPs and CIDRs before storage',async()=>{
    findUnique.mockResolvedValue({hashIp:true,hashVisitor:true,storeUserAgent:false,storeReferrer:true,aggregateOnly:false,analyticsExclusions:['203.0.113.0/24']})
    const base={clickEventId:'c',urlId:'u',visitorIdHash:'v',dateKey:'2026-09-01',shortCode:'x'}
    expect(await sanitizeClickForIngestion({...base,ip:'203.0.113.77'},'ws')).toBeNull()
    expect(await sanitizeClickForIngestion({...base,ip:'198.51.100.1'},'ws')).not.toBeNull()
  })
})

describe('privacy signals (GPC/DNT)',()=>{
  const base={clickEventId:'c',urlId:'u',ip:'203.0.113.4',visitorIdHash:'v',userAgent:'ua',referer:'https://r.example',referrerHost:'r.example',country:'IN',utmSource:'s',dateKey:'2026-09-01',shortCode:'x'}
  beforeEach(()=>{findUnique.mockReset();clearPrivacyCache()})
  it('anonymizes signalled clicks when the workspace honors signals but keeps them counted',async()=>{
    findUnique.mockResolvedValue({hashIp:true,hashVisitor:true,storeUserAgent:true,storeReferrer:true,aggregateOnly:false,honorPrivacySignals:true})
    const r=await sanitizeClickForIngestion({...base,privacySignal:true},'ws')
    expect(r).toMatchObject({ip:null,visitorIdHash:null,userAgent:null,referer:null,utmSource:null,country:null})
  })
  it('leaves clicks untouched without a signal or when the option is off',async()=>{
    findUnique.mockResolvedValue({hashIp:true,hashVisitor:true,storeUserAgent:true,storeReferrer:true,aggregateOnly:false,honorPrivacySignals:true})
    expect((await sanitizeClickForIngestion(base,'ws'))?.ip).toHaveLength(64)
    clearPrivacyCache()
    findUnique.mockResolvedValue({hashIp:true,hashVisitor:true,storeUserAgent:true,storeReferrer:true,aggregateOnly:false,honorPrivacySignals:false})
    expect((await sanitizeClickForIngestion({...base,privacySignal:true},'ws'))?.ip).toHaveLength(64)
  })
})
