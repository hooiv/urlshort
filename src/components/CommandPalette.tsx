/* eslint-disable react-hooks/set-state-in-effect -- remote/session synchronization occurs after mount. */
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Link as LinkIcon, Code, Zap, LayoutDashboard, Globe } from 'lucide-react'
import {
  clampActiveIndex,
  filterActions,
  getNextActiveIndex,
  isDismissKey,
  isPaletteToggleShortcut,
  shouldSearchLinks,
} from '@/components/command-palette-logic'

type SearchLink = { id: string; shortCode: string; title: string | null; originalUrl: string }

const ALL_ACTIONS = [
  { name: 'Dashboard / Creator', path: '/' },
  { name: 'Workspaces', path: '/workspaces' },
  { name: 'Bio Pages', path: '/manage/bio' },
  { name: 'Webhooks', path: '/manage/webhooks' },
  { name: 'Bulk Import CSV', path: '/bulk' },
]

function ActionIcon({ name }: { name: string }) {
  const cls = 'w-4 h-4'
  if (name === 'Dashboard / Creator') return <LayoutDashboard className={cls} />
  if (name === 'Workspaces') return <Globe className={cls} />
  if (name === 'Bio Pages') return <LinkIcon className={cls} />
  if (name === 'Webhooks') return <Zap className={cls} />
  return <Code className={cls} />
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [links, setLinks] = useState<SearchLink[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const router = useRouter()
  const requestIdRef = useRef(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isPaletteToggleShortcut(e.key, e.metaKey, e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      } else if (isDismissKey(e.key)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setLinks([])
      setActiveIndex(-1)
      return
    }
    if (!shouldSearchLinks(query)) {
      setLinks([])
      setLoading(false)
      return
    }
    requestIdRef.current += 1
    const id = requestIdRef.current
    const controller = new AbortController()
    const delayDebounceFn = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/shorten?search=${encodeURIComponent(query)}&take=5`, {
          signal: controller.signal,
        })
        if (controller.signal.aborted || id !== requestIdRef.current) return
        if (res.ok) {
          const data = await res.json()
          if (id === requestIdRef.current) {
            setLinks(Array.isArray(data?.links) ? data.links : [])
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        console.error(e)
      } finally {
        if (id === requestIdRef.current && !controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(delayDebounceFn)
      controller.abort()
    }
  }, [query, open])

  const actions = useMemo(() => filterActions(ALL_ACTIONS, query), [query])

  const total = actions.length + links.length

  useEffect(() => {
    setActiveIndex((prev) => clampActiveIndex(prev, total))
  }, [total])

  if (!open) return null

  const move = (direction: 1 | -1) => {
    setActiveIndex((prev) => getNextActiveIndex(prev, total, direction))
  }

  const chooseIndex = (index: number) => {
    if (index < 0 || index >= total) return
    if (index < actions.length) {
      router.push(actions[index].path)
    } else {
      const link = links[index - actions.length]
      if (link) router.push(`/manage/${link.shortCode}`)
    }
    setOpen(false)
  }

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh]">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setOpen(false)} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={trapTab}
        className="relative w-full max-w-xl transform overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl ring-1 ring-white/10 transition-all mx-4"
      >
        <div className="flex items-center border-b border-slate-800 px-3">
          <Search className="h-5 w-5 text-slate-500" />
          <input
            ref={inputRef}
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-autocomplete="list"
            aria-label="Search links and pages"
            className="flex h-14 w-full bg-transparent py-3 pl-3 pr-4 text-slate-100 placeholder-slate-500 outline-none sm:text-sm"
            placeholder="Search links, navigate to spaces... (Cmd+K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                move(1)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                move(-1)
              } else if (e.key === 'Enter' && activeIndex >= 0) {
                e.preventDefault()
                chooseIndex(activeIndex)
              }
            }}
          />
          <div className="flex items-center gap-1 text-xs text-slate-500 font-mono bg-slate-800 px-2 py-1 rounded">
            <span>ESC</span>
          </div>
        </div>

        {(actions.length > 0 || links.length > 0 || loading) && (
          <div
            id="cmdk-list"
            role="listbox"
            aria-label="Results"
            className="max-h-96 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
          >
            {actions.length > 0 && (
              <div className="mb-2">
                <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Navigation</div>
                {actions.map((action, i) => (
                  <button
                    key={action.name}
                    role="option"
                    aria-selected={i === activeIndex}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-blue-600/10 hover:text-blue-400 transition-colors"
                    onClick={() => {
                      router.push(action.path)
                      setOpen(false)
                    }}
                  >
                    <ActionIcon name={action.name} />
                    {action.name}
                  </button>
                ))}
              </div>
            )}

            {loading && <div className="p-4 text-center text-sm text-slate-500">Searching links...</div>}

            {!loading && links.length > 0 && (
              <div>
                <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Links</div>
                {links.map((link, j) => {
                  const index = actions.length + j
                  return (
                    <button
                      key={link.id}
                      role="option"
                      aria-selected={index === activeIndex}
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
                  )
                })}
              </div>
            )}
          </div>
        )}

        {!loading && query.length >= 2 && actions.length === 0 && links.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">
            No results found for &quot;{query}&quot;
          </div>
        )}
      </div>
    </div>
  )
}
