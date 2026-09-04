export interface Domain {
  id: string
  host: string
  status: 'pending' | 'verified' | 'disabled'
  verificationToken: string
  verifiedAt: string | null
  tlsReady: boolean
}

export interface Binding {
  id: string
  path: string
  domain: Domain
}

export interface DnsRecords {
  name: string
  type: string
  value: string
  cname: { name: string; type: string; value: string }
}

export interface ApiResponse {
  verified: boolean
  domain: Domain
  dns?: DnsRecords
  link?: { id: string; path: string }
}
