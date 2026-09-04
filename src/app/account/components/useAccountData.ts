'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { AuditEvent, InviteState, Url, User } from '@/app/account/components/types'
import { buildShortenQuery } from '@/app/account/components/account-utils'

type LinksPayload = { links?: Url[]; nextCursor?: string | null } | Url[]

function readLinksPayload(data: LinksPayload | null): { links: Url[]; cursor: string | null } | null {
  if (!data) return null
  if (Array.isArray(data)) return { links: data, cursor: null }
  return { links: data.links ?? [], cursor: data.nextCursor ?? null }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Owns session, links, activity, and invite state for the account dashboard. */
export function useAccountData(inviteToken: string | null) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [links, setLinks] = useState<Url[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState('')
  const [activity, setActivity] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteState, setInviteState] = useState<InviteState>('pending')
  const [inviteError, setInviteError] = useState<string | null>(null)

  const linksSeq = useRef(0)
  const linksAbort = useRef<AbortController | null>(null)
  const loadMoreBusy = useRef(false)
  const acceptedInviteRef = useRef<string | null>(null)
  const inviteTokenRef = useRef(inviteToken)
  useEffect(() => {
    inviteTokenRef.current = inviteToken
  }, [inviteToken])

  const acceptInvite = useCallback(
    async (token: string) => {
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
    },
    [router],
  )

  /** Full reload: session, then links + audit. Invite is accepted at most once per token. */
  const reload = useCallback(async () => {
    try {
      const me = await fetch('/api/auth/me')
      const meData = await me.json()
      setUser(meData.user ?? null)
      if (meData.user) {
        // If the visitor arrived with an invite token, accept it now that we
        // know who they are (the accept endpoint enforces the email match).
        const token = inviteTokenRef.current
        if (token && acceptedInviteRef.current !== token) {
          acceptedInviteRef.current = token
          await acceptInvite(token)
        }
        const [linksResponse, activityResponse] = await Promise.all([
          fetch(`/api/shorten?${buildShortenQuery({ take: 50 })}`),
          fetch('/api/account/audit'),
        ])
        const linksData = await linksResponse.json().catch(() => null)
        if (linksResponse.ok && linksData) {
          const parsed = readLinksPayload(linksData)
          if (parsed) {
            setLinks(parsed.links)
            setNextCursor(parsed.cursor)
          }
        }
        const activityData = await activityResponse.json()
        if (activityResponse.ok) setActivity(activityData)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load account data')
    } finally {
      setLoading(false)
    }
  }, [acceptInvite])

  // Run once on mount; the live invite token is read via ref.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote load populates local state after mount
    void reload()
    return () => {
      linksAbort.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; reload is stable
  }, [])

  /**
   * Filtered link search with abort + sequence guards so rapid keystrokes can
   * never let a stale response overwrite newer results.
   */
  const searchLinks = useCallback(async (query: string, tag?: string) => {
    setSearch(query)
    const seq = linksSeq.current + 1
    linksSeq.current = seq
    linksAbort.current?.abort()
    const controller = new AbortController()
    linksAbort.current = controller
    try {
      const response = await fetch(`/api/shorten?${buildShortenQuery({ take: 50, search: query, tag })}`, {
        signal: controller.signal,
      })
      const data = await response.json().catch(() => null)
      if (controller.signal.aborted || linksSeq.current !== seq) return
      if (response.ok && data) {
        const parsed = readLinksPayload(data)
        if (parsed) {
          setLinks(parsed.links)
          setNextCursor(parsed.cursor)
        }
      }
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return
      /* keep current list on transient failure */
    }
  }, [])

  /** Next page of the current filter. Includes the tag (the old code dropped it) and ignores overlaps. */
  const loadMore = useCallback(async () => {
    if (loadMoreBusy.current) return
    const cursor = nextCursor
    if (!cursor) return
    loadMoreBusy.current = true
    const seq = linksSeq.current + 1
    linksSeq.current = seq
    try {
      const response = await fetch(
        `/api/shorten?${buildShortenQuery({ take: 50, search, tag: activeTag || undefined, cursor })}`,
      )
      const data = await response.json().catch(() => null)
      if (linksSeq.current !== seq) return
      if (response.ok && data) {
        const parsed = readLinksPayload(data)
        if (parsed) {
          if (parsed.links.length) setLinks((current) => [...current, ...parsed.links])
          setNextCursor(parsed.cursor)
        }
      }
    } catch {
      toast.error('Could not load more links')
    } finally {
      loadMoreBusy.current = false
    }
  }, [nextCursor, search, activeTag])

  const handleSignedIn = useCallback(
    async (signedInUser: User) => {
      setUser(signedInUser)
      await reload()
    },
    [reload],
  )

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    linksAbort.current?.abort()
    linksSeq.current += 1
    setUser(null)
    setLinks([])
    setNextCursor(null)
    setActivity([])
    toast.success('Signed out')
  }, [])

  return {
    user,
    links,
    nextCursor,
    search,
    activeTag,
    setActiveTag,
    activity,
    loading,
    inviteState,
    inviteError,
    searchLinks,
    loadMore,
    reload,
    handleSignedIn,
    logout,
  }
}
