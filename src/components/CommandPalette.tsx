'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Link as LinkIcon, Settings, Code, BarChart2, Zap, LayoutDashboard, Globe } from 'lucide-react'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [links, setLinks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setLinks([])
      return
    }
    if (query.trim().length < 2) {
      setLinks([])
      return
    }
    const delayDebounceFn = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/shorten?search=${encodeURIComponent(query)}&take=5`)
        if (res.ok) {
          const data = await res.json()
          setLinks(data.links || [])
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(delayDebounceFn)
  }, [query, open])

  if (!open) return null

  const actions = [
    { name: 'Dashboard / Creator', icon: <LayoutDashboard className="w-4 h-4" />, path: '/' },
    { name: 'Workspaces', icon: <Globe className="w-4 h-4" />, path: '/workspaces' },
    { name: 'Bio Pages', icon: <LinkIcon className="w-4 h-4" />, path: '/manage/bio' },
    { name: 'Webhooks', icon: <Zap className="w-4 h-4" />, path: '/manage/webhooks' },
    { name: 'Bulk Import CSV', icon: <Code className="w-4 h-4" />, path: '/bulk' }
  ].filter(a => a.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh]">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
      
      <div className="relative w-full max-w-xl transform overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl ring-1 ring-white/10 transition-all mx-4">
        <div className="flex items-center border-b border-slate-800 px-3">
          <Search className="h-5 w-5 text-slate-500" />
          <input
            autoFocus
            className="flex h-14 w-full bg-transparent py-3 pl-3 pr-4 text-slate-100 placeholder-slate-500 outline-none sm:text-sm"
            placeholder="Search links, navigate to spaces... (Cmd+K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex items-center gap-1 text-xs text-slate-500 font-mono bg-slate-800 px-2 py-1 rounded">
            <span>ESC</span>
          </div>
        </div>

        {(actions.length > 0 || links.length > 0 || loading) && (
          <div className="max-h-96 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {actions.length > 0 && (
              <div className="mb-2">
                <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Navigation</div>
                {actions.map(action => (
                  <button
                    key={action.name}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-blue-600/10 hover:text-blue-400 transition-colors"
                    onClick={() => {
                      router.push(action.path)
                      setOpen(false)
                    }}
                  >
                    {action.icon}
                    {action.name}
                  </button>
                ))}
              </div>
            )}
            
            {loading && <div className="p-4 text-center text-sm text-slate-500">Searching links...</div>}
            
            {!loading && links.length > 0 && (
              <div>
                <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Links</div>
                {links.map(link => (
                  <button
                    key={link.id}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors text-left"
                    onClick={() => {
                      router.push(`/manage/${link.shortCode}`)
                      setOpen(false)
                    }}
                  >
                    <div className="flex flex-col items-start truncate pr-4">
                      <span className="font-medium text-slate-200">{link.title || link.shortCode}</span>
                      <span className="text-xs text-slate-500 truncate max-w-xs block">{link.originalUrl}</span>
                    </div>
                    <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded-md border border-slate-800 flex-shrink-0">
                      /{link.shortCode}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        
        {!loading && query.length >= 2 && actions.length === 0 && links.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">
            No results found for "{query}"
          </div>
        )}
      </div>
    </div>
  )
}
