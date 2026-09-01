import json, urllib.error, urllib.request
class QuickLinkError(Exception):
    def __init__(self,status,message,request_id=None): super().__init__(message); self.status=status; self.message=message; self.request_id=request_id
class Client:
    def __init__(self, base_url: str, api_key: str, timeout: float=10): self.base_url=base_url.rstrip('/'); self.api_key=api_key; self.timeout=timeout
    def request(self,path,method='GET',body=None):
        data=json.dumps(body).encode() if body is not None else None
        req=urllib.request.Request(self.base_url+path,data=data,method=method,headers={'Authorization':'Bearer '+self.api_key,'Accept':'application/json','Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=self.timeout) as r: return json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            try: b=json.loads(e.read() or b'{}')
            except Exception: b={}
            raise QuickLinkError(e.code,b.get('error',f'HTTP {e.code}'),b.get('requestId')) from e
    def campaigns(self): return self.request('/api/v1/campaigns')
    def create_link(self,url): return self.request('/api/shorten','POST',{'url':url})
