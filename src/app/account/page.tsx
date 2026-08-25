'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Copy, KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

type User = { id: string; email: string; name: string | null; emailVerifiedAt?: string | null }
type Url = { id: string; originalUrl: string; shortCode: string; title: string | null; tags?: string[]; clicks: number; createdAt: string; isActive: boolean; riskStatus: string; _count?: { rules: number } }
type AuditEvent = { id: string; action: string; actorType: string; resourceType: string | null; createdAt: string; metadataJson: string | null; urlId: string | null }

export default function AccountPage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">Loading…</div>}><AccountPageInner /></Suspense>
}

function AccountPageInner() {
  const params = useSearchParams()
  const router = useRouter()
  const inviteToken = params.get('invite')
  const [user, setUser] = useState<User | null>(null)
  const [links, setLinks] = useState<Url[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activity, setActivity] = useState<AuditEvent[]>([])
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTag, setActiveTag] = useState<string>('')
  const [inviteState, setInviteState] = useState<'pending' | 'accepted' | 'error'>('pending')
  const [inviteError, setInviteError] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; load reads the latest inviteToken via closure
  useEffect(() => { void load() }, [])
  async function load() {
    try {
      const me = await fetch('/api/auth/me'); const meData = await me.json(); setUser(meData.user)
      if (meData.user) {
        // If the visitor arrived with an invite token, accept it now that we
        // know who they are (the accept endpoint enforces the email match).
        if (inviteToken) await acceptInvite(inviteToken)
        const [linksResponse, activityResponse] = await Promise.all([fetch('/api/shorten?take=50'), fetch('/api/account/audit')])
        const linksData = await linksResponse.json().catch(() => null)
        if (linksResponse.ok && linksData) { setLinks(linksData.links ?? linksData); setNextCursor(linksData.nextCursor ?? null) }
        const activityData = await activityResponse.json(); if (activityResponse.ok) setActivity(activityData)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load account data')
    } finally {
      setLoading(false)
    }
  }

  async function acceptInvite(token: string) {
    try {
      const response = await fetch(`/api/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not accept the invitation')
      setInviteState('accepted')
      toast.success('Invitation accepted — welcome to the workspace!')
      // Clean the token out of the address bar so refreshes don't re-accept.
      router.replace('/account')
    } catch (error) {
      setInviteState('error')
      setInviteError(error instanceof Error ? error.message : 'Could not accept the invitation')
    }
  }

  async function searchLinks(query: string, tag?: string) {
    setSearch(query)
    const params = new URLSearchParams({ take: '50' })
    if (query.trim()) params.set('search', query.trim())
    if (tag) params.set('tag', tag)
    try {
      const response = await fetch(`/api/shorten?${params}`)
      const data = await response.json().catch(() => null)
      if (response.ok && data) { setLinks(data.links ?? data); setNextCursor(data.nextCursor ?? null) }
    } catch { /* keep current list on transient failure */ }
  }

  async function loadMore() {
    if (!nextCursor) return
    const params = new URLSearchParams({ take: '50', cursor: nextCursor })
    if (search.trim()) params.set('search', search.trim())
    try {
      const response = await fetch(`/api/shorten?${params}`)
      const data = await response.json().catch(() => null)
      if (response.ok && data) { setLinks((current) => [...current, ...(data.links ?? [])]); setNextCursor(data.nextCursor ?? null) }
    } catch { toast.error('Could not load more links') }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body = mode === 'login' ? { email, password } : { email, password, name }
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Authentication failed')
      setUser(data.user); toast.success(mode === 'login' ? 'Signed in' : 'Account created'); setPassword(''); setEmail(''); setName(''); await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Authentication failed') } finally { setLoading(false) }
  }

  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); setUser(null); setLinks([]); toast.success('Signed out') }

  const searchInputRef = useRef<HTMLInputElement>(null)
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading && !user) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">Loading account…</div>
  if (!user) return <AuthForm mode={mode} setMode={setMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} name={name} setName={setName} loading={loading} onSubmit={submit} inviteToken={inviteToken} />

  return <div className="min-h-screen bg-slate-950 text-slate-100"><Toaster position="top-right" /><header className="border-b border-slate-800"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5"><Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> QuickLink</Link><div className="flex items-center gap-2"><Link href="/api-docs" className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500">API Docs</Link><Link href="/abuse" className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500">Trust & Safety</Link><Link href="/workspaces" className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500">Workspaces</Link><button onClick={() => void logout()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:text-white"><LogOut className="h-4 w-4" /> Sign out</button></div></div></header><main className="mx-auto max-w-6xl space-y-8 px-6 py-10"><section><p className="text-sm text-blue-300">Account</p><h1 className="mt-1 text-3xl font-semibold">{user.name || user.email}</h1><p className="mt-2 text-sm text-slate-500">{user.email}</p></section>
  <SummaryStats links={links} />
  {inviteToken && inviteState === 'error' && <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5"><p className="text-sm font-medium text-red-300">Invitation could not be accepted</p><p className="mt-1 text-xs text-red-200/70">{inviteError} Make sure you are signed in with the email the invite was sent to.</p></section>}
  {inviteState === 'accepted' && <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5"><p className="text-sm font-medium text-emerald-300">Invitation accepted 🎉</p><p className="mt-1 text-xs text-emerald-200/70">The workspace now appears in your <Link href="/workspaces" className="underline">workspaces</Link>.</p></section>}
  <VerifyEmailBanner user={user} />
  <ApiKeysSection />
  <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"><div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-emerald-400" /><div><h2 className="font-semibold">Your links</h2><p className="text-xs text-slate-500">Search, edit, pause, and manage every link you can access.</p></div></div><div className="flex items-center gap-3"><a href="/api/account/export" download="quicklink-account-export.csv" className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:border-slate-500">Export CSV</a><Link href="/bulk" className="rounded-xl bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/20">Bulk Import</Link><div className="relative"><input ref={searchInputRef} value={search} onChange={(e) => void searchLinks(e.target.value)} placeholder="Search code, title, or destination…" className="input w-full sm:w-80 pr-12" /><div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3"><kbd className="hidden rounded border border-slate-700 bg-slate-800 px-1.5 font-sans text-[10px] font-medium text-slate-400 sm:inline-block">⌘K</kbd></div></div></div></div>
  <TagFilter links={links} activeTag={activeTag} onSelect={(tag) => { setActiveTag(tag); void searchLinks(search, tag || undefined) }} />
  {links.length ? <div className="grid gap-3 md:grid-cols-2">{links.map((link) => <LinkCard key={link.id} link={link} onChanged={() => void searchLinks(search, activeTag || undefined)} onSelectTag={(tag) => { setActiveTag(tag); void searchLinks(search, tag) }} />)}</div> : <p className="text-sm text-slate-500">{search || activeTag ? 'No links match your filters.' : 'No account-owned links yet. Create one from the home page.'}</p>}{nextCursor && <div className="mt-5 text-center"><button onClick={() => void loadMore()} className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-300 hover:border-slate-500">Load more</button></div>}</section><section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"><div className="mb-5 flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-blue-300" /><div><h2 className="font-semibold">Security activity</h2><p className="text-xs text-slate-500">Recent account and campaign changes. IP addresses are never shown.</p></div></div>{activity.length ? <div className="divide-y divide-slate-800">{activity.slice(0, 25).map((event) => <div key={event.id} className="flex items-center justify-between gap-4 py-3"><div><div className="text-sm font-medium text-slate-200">{formatAuditAction(event.action)}</div><div className="mt-1 text-xs text-slate-500">{event.resourceType || 'account'}{event.urlId ? ` · link ${event.urlId.slice(0, 8)}` : ''}</div></div><time className="shrink-0 text-xs text-slate-600">{new Date(event.createdAt).toLocaleString()}</time></div>)}</div> : <p className="text-sm text-slate-500">No recorded activity yet.</p>}</section></main></div>
}

function AuthForm(props: { mode: 'login' | 'register'; setMode: (mode: 'login' | 'register') => void; email: string; setEmail: (v: string) => void; password: string; setPassword: (v: string) => void; name: string; setName: (v: string) => void; loading: boolean; onSubmit: (e: React.FormEvent) => void; inviteToken: string | null }) {
  const [resetEmail, setResetEmail] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [showReset, setShowReset] = useState(false)
  // Prefill the email so the invitee signs in with the invited address.
  useEffect(() => { if (props.inviteToken) { try { const invited = new URLSearchParams(window.location.search).get('email'); if (invited) props.setEmail(invited) } catch { /* ignore */ } } }, [props.inviteToken]) // eslint-disable-line react-hooks/exhaustive-deps

  async function requestReset(event: React.FormEvent) {
    event.preventDefault()
    setResetBusy(true)
    try {
      const response = await fetch('/api/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: resetEmail }) })
      if (!response.ok) throw new Error('Could not send reset email')
      toast.success('If that account exists, a reset link has been sent (check the server logs in development)')
      setShowReset(false)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not send reset email') } finally { setResetBusy(false) }
  }

  return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100"><Toaster position="top-right" /><div className="w-full max-w-md"><Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to QuickLink</Link><div className="rounded-2xl border border-slate-800 bg-slate-900 p-8"><div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-blue-300" /><div><h1 className="text-xl font-semibold">{props.mode === 'login' ? 'Sign in' : 'Create your account'}</h1><p className="text-xs text-slate-500">{props.inviteToken ? 'Sign in to accept your workspace invitation.' : 'Own and manage your campaign infrastructure.'}</p></div></div>{props.inviteToken && <p className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-xs text-blue-200">You have a pending workspace invitation — sign in (or create an account with the invited email) and it will be accepted automatically.</p>}<form onSubmit={props.onSubmit} className="mt-7 space-y-4">{props.mode === 'register' && <Field label="Name"><input value={props.name} onChange={(e) => props.setName(e.target.value)} className="input" maxLength={80} /></Field>}<Field label="Email"><input required type="email" value={props.email} onChange={(e) => props.setEmail(e.target.value)} className="input" /></Field><Field label="Password"><input required type="password" minLength={12} value={props.password} onChange={(e) => props.setPassword(e.target.value)} className="input" /></Field><button disabled={props.loading} className="w-full rounded-xl bg-blue-500 px-4 py-3 font-semibold hover:bg-blue-400 disabled:opacity-60">{props.loading ? 'Working…' : props.mode === 'login' ? 'Sign in' : 'Create account'}</button></form>{props.mode === 'login' && <button onClick={() => setShowReset((value) => !value)} className="mt-3 w-full text-xs text-slate-500 hover:text-slate-300">Forgot password?</button>}
    {showReset && <form onSubmit={requestReset} className="mt-4 flex gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3"><input required type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="Your account email" className="input flex-1" /><button disabled={resetBusy} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-60">{resetBusy ? '…' : 'Send link'}</button></form>}
    <button onClick={() => props.setMode(props.mode === 'login' ? 'register' : 'login')} className="mt-5 w-full text-sm text-slate-500 hover:text-slate-300">{props.mode === 'login' ? 'Create an account' : 'I already have an account'}</button><p className="mt-5 text-[11px] leading-5 text-slate-600">In development, reset links are printed to the server console.</p></div></div></div>
}

function formatAuditAction(action: string): string {
  const labels: Record<string, string> = {
    'auth.register': 'Account created',
    'auth.login': 'Signed in',
    'auth.logout': 'Signed out',
    'routing_rule.create': 'Routing rule created',
    'destination_release.create': 'Destination release published',
  }
  return labels[action] || action.replace(/[._]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm"><span className="mb-2 block text-xs text-slate-400">{label}</span>{children}</label> }

type LinkCardProps = { link: Url; onChanged: () => void; onSelectTag?: (tag: string) => void }

function LinkCard({ link, onChanged, onSelectTag }: LinkCardProps) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [title, setTitle] = useState(link.title || '')
  const [destination, setDestination] = useState(link.originalUrl)
  const [tagsInput, setTagsInput] = useState((link.tags ?? []).join(', '))

  async function patch(body: Record<string, unknown>, successMessage: string) {
    setBusy(true)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(link.shortCode)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Update failed')
      toast.success(successMessage); setEditing(false); onChanged()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Update failed') } finally { setBusy(false) }
  }

  async function remove() {
    if (!window.confirm(`Delete /${link.shortCode}? The short code stops working immediately. Analytics history is kept.`)) return
    setBusy(true)
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(link.shortCode)}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Delete failed')
      toast.success('Link deleted'); onChanged()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Delete failed') } finally { setBusy(false) }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success('Copied') } catch { toast.error('Clipboard access failed') }
  }

  const shortUrl = `${window.location.origin}/${link.shortCode}`
  const statusBadge = !link.isActive
    ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">paused</span>
    : link.riskStatus === 'review'
      ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">in review</span>
      : null

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="truncate font-medium">{link.title || `/${link.shortCode}`}</span>{statusBadge}</div>
          <button onClick={() => void copy(shortUrl)} className="mt-2 flex max-w-full items-center gap-2 truncate font-mono text-xs text-blue-300 hover:text-blue-200" title="Copy short URL">/{link.shortCode}<Copy className="h-3 w-3 shrink-0" /></button>
          <a href={link.originalUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-slate-600 hover:text-slate-400">{link.originalUrl}</a>
        </div>
        <div className="shrink-0 text-right"><div className="text-sm font-semibold">{link.clicks.toLocaleString()}</div><div className="text-[10px] text-slate-600">clicks</div></div>
      </div>

      {editing && <div className="mt-4 space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="input" placeholder="Internal label" /></Field>
        <Field label="Fallback destination"><input value={destination} onChange={(e) => setDestination(e.target.value)} type="url" className="input" /></Field>
        <Field label={`Tags (comma-separated, max 10)`}><input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="input" placeholder="summer, paid-ads" /></Field>
        <div className="flex justify-end gap-2">
          <button onClick={() => { setEditing(false); setTitle(link.title || ''); setDestination(link.originalUrl); setTagsInput((link.tags ?? []).join(', ')) }} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancel</button>
          <button disabled={busy} onClick={() => void patch({ title: title.trim() || null, destinationUrl: destination.trim(), tags: tagsInput.split(',').map((tag) => tag.trim()).filter(Boolean) }, 'Link updated')} className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold hover:bg-blue-400 disabled:opacity-60">Save</button>
        </div>
      </div>}

      {showQr && <div className="mt-4 flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        {/* eslint-disable @next/next/no-img-element -- API-served QR image */}
        <img src={`/api/links/${encodeURIComponent(link.shortCode)}/qr?size=256`} alt={`QR code for /${link.shortCode}`} width={96} height={96} className="rounded-lg bg-white p-1.5" />
        {/* eslint-enable @next/next/no-img-element */}
        <div><p className="text-xs text-slate-400">Scan to open</p><a href={`/api/links/${encodeURIComponent(link.shortCode)}/qr?size=1024`} download={`quicklink-${link.shortCode}-qr.png`} className="mt-2 inline-flex rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium hover:border-slate-500">Download PNG</a></div>
      </div>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">{(link.tags ?? []).map((tag) => <button key={tag} onClick={() => onSelectTag?.(tag)} className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300 hover:bg-violet-500/25">{tag}</button>)}<span className="text-[10px] text-slate-600">{new Date(link.createdAt).toLocaleDateString()} · {link._count?.rules ?? 0} rules</span></div>
        <div className="flex flex-wrap gap-1">
          <CardAction onClick={() => setShowQr((value) => !value)} label={showQr ? 'Hide QR' : 'QR'} />
          <CardAction onClick={() => setEditing((value) => !value)} label="Edit" />
          <CardAction disabled={busy} onClick={() => void patch({ isActive: !link.isActive }, link.isActive ? 'Link paused' : 'Link activated')} label={link.isActive ? 'Pause' : 'Activate'} />
          <a href={`/analytics/${link.shortCode}`} className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-800 hover:text-white">Analytics</a>
          <a href={`/manage/${link.shortCode}`} className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-800 hover:text-white">Manage</a>
          <CardAction disabled={busy} onClick={() => void remove()} label="Delete" danger />
        </div>
      </div>
    </article>
  )
}

function CardAction({ onClick, label, disabled, danger }: { onClick: () => void; label: string; disabled?: boolean; danger?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className={`rounded-lg px-2 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50 ${danger ? 'text-red-400/80 hover:text-red-300' : 'text-slate-500 hover:text-white'}`}>{label}</button>
}

function TagFilter({ links, activeTag, onSelect }: { links: Url[]; activeTag: string; onSelect: (tag: string) => void }) {
  const allTags = [...new Set(links.flatMap((link) => link.tags ?? []))].sort()
  if (!allTags.length) return null
  return <div className="mb-4 flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">Filter by tag:</span><button onClick={() => onSelect('')} className={`rounded-full px-3 py-1 text-xs ${!activeTag ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>All</button>{allTags.map((tag) => <button key={tag} onClick={() => onSelect(tag === activeTag ? '' : tag)} className={`rounded-full px-3 py-1 text-xs ${tag === activeTag ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>{tag}</button>)}</div>
}

function SummaryStats({ links }: { links: Url[] }) {
  const totalClicks = links.reduce((sum, link) => sum + link.clicks, 0)
  const active = links.filter((link) => link.isActive).length
  const stats = [
    { label: 'Links', value: links.length.toLocaleString() },
    { label: 'Active', value: active.toLocaleString() },
    { label: 'Total clicks', value: totalClicks.toLocaleString() },
    { label: 'Avg clicks / link', value: links.length ? Math.round(totalClicks / links.length).toLocaleString() : '0' },
  ]
  return <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"><div className="text-xs text-slate-500">{stat.label}</div><div className="mt-1 text-2xl font-semibold tracking-tight">{stat.value}</div></div>)}</section>
}

function VerifyEmailBanner({ user }: { user: User }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  if (user.emailVerifiedAt) return null

  async function resend() {
    setSending(true)
    try {
      const response = await fetch('/api/auth/verify', { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not send verification email')
      setSent(true)
      toast.success('Verification email sent (check the server logs in development)')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not send verification email') } finally { setSending(false) }
  }

  return <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-medium text-amber-200">Verify your email address</p><p className="mt-1 text-xs text-amber-100/70">{sent ? 'Link sent — check your inbox. In development it is printed to the server console.' : 'Confirm your address to secure account recovery and workspace invitations.'}</p></div>
      <button onClick={() => void resend()} disabled={sending || sent} className="shrink-0 rounded-lg bg-amber-400/90 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-60">{sending ? 'Sending…' : sent ? 'Sent' : 'Resend link'}</button>
    </div>
  </section>
}

type ApiKeyRow = { id: string; name: string; prefix: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void loadKeys() }, [])
  async function loadKeys() {
    try {
      const response = await fetch('/api/account/api-keys')
      if (response.ok) setKeys(await response.json())
    } catch { /* non-critical */ }
  }

  async function createKey(event: React.FormEvent) {
    event.preventDefault()
    if (!newKeyName.trim()) return toast.error('Give the key a name')
    setBusy(true)
    try {
      const response = await fetch('/api/account/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newKeyName.trim() }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Could not create key')
      setCreatedKey(data.key); setNewKeyName(''); await loadKeys()
      toast.success('API key created — copy it now, it won\'t be shown again')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create key') } finally { setBusy(false) }
  }

  async function revokeKey(id: string) {
    if (!window.confirm('Revoke this API key? Applications using it will immediately lose access.')) return
    try {
      const response = await fetch(`/api/account/api-keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Revoke failed')
      toast.success('API key revoked'); await loadKeys()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Revoke failed') }
  }

  return <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
    <div className="mb-5 flex items-center gap-3"><KeyRound className="h-5 w-5 text-violet-300" /><div><h2 className="font-semibold">API keys</h2><p className="text-xs text-slate-500">Programmatic access — send as <code className="text-slate-400">x-api-key</code> or <code className="text-slate-400">Authorization: Bearer</code>. See the <Link href="/api-docs" className="text-blue-300 underline">API reference</Link>.</p></div></div>
    {createdKey && <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <p className="text-xs font-semibold text-emerald-300">Copy your key now — it is shown only once</p>
      <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-emerald-200">{createdKey}</code><button onClick={async () => { try { await navigator.clipboard.writeText(createdKey); toast.success('Copied') } catch { toast.error('Clipboard failed') } }} className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-slate-500"><Copy className="h-3.5 w-3.5" /></button></div>
      <button onClick={() => setCreatedKey(null)} className="mt-2 text-xs text-slate-500 hover:text-slate-300">Done — hide</button>
    </div>}
    <form onSubmit={createKey} className="flex flex-col gap-3 sm:flex-row"><input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} maxLength={80} placeholder="Key name (e.g. zapier-integration)" className="input flex-1" /><button disabled={busy} className="rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-semibold hover:bg-violet-400 disabled:opacity-60">Create key</button></form>
    {keys.length > 0 && <div className="mt-5 divide-y divide-slate-800">{keys.map((apiKey) => <div key={apiKey.id} className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0"><div className="flex items-center gap-2 text-sm font-medium">{apiKey.name}{apiKey.revokedAt ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">revoked</span> : null}</div><div className="mt-0.5 font-mono text-xs text-slate-600">{apiKey.prefix}… · created {new Date(apiKey.createdAt).toLocaleDateString()}{apiKey.lastUsedAt ? ` · last used ${new Date(apiKey.lastUsedAt).toLocaleDateString()}` : ' · never used'}</div></div>
      {!apiKey.revokedAt && <CardAction onClick={() => void revokeKey(apiKey.id)} label="Revoke" danger />}
    </div>)}</div>}
  </section>
}
