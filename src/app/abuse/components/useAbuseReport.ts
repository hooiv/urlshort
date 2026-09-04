'use client'

import { useCallback, useRef, useState } from 'react'
import {
  buildReportPayload,
  getApiErrorMessage,
  validateReportInput,
} from './abuse-logic'

/**
 * Owns the "File an Abuse Ticket" form state. Guards against double
 * submits and ignores stale responses via a request id.
 */
export function useAbuseReport() {
  const [shortCode, setShortCode] = useState('')
  const [reason, setReason] = useState('phishing')
  const [details, setDetails] = useState('')
  const [reporterEmail, setReporterEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const requestId = useRef(0)

  const handleReportSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (submitting) return
      const validationError = validateReportInput({ shortCode, reason, details, reporterEmail })
      if (validationError) {
        const { default: toast } = await import('react-hot-toast')
        toast.error(validationError)
        return
      }
      const currentId = requestId.current + 1
      requestId.current = currentId
      setSubmitting(true)
      try {
        const res = await fetch('/api/abuse/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildReportPayload({ shortCode, reason, details, reporterEmail })),
        })
        const data: unknown = await res.json().catch(() => null)
        if (!res.ok) throw new Error(getApiErrorMessage(data, 'Could not submit report'))
        if (requestId.current !== currentId) return
        const id =
          typeof data === 'object' && data !== null && 'id' in data && typeof data.id === 'string'
            ? data.id
            : null
        setTicketId(id)
        const { default: toast } = await import('react-hot-toast')
        toast.success('Abuse report submitted. Thank you for keeping QuickLink safe!')
      } catch (err) {
        if (requestId.current !== currentId) return
        const { default: toast } = await import('react-hot-toast')
        toast.error(err instanceof Error ? err.message : 'Report submission failed')
      } finally {
        if (requestId.current === currentId) setSubmitting(false)
      }
    },
    [shortCode, reason, details, reporterEmail, submitting],
  )

  const resetTicket = useCallback(() => {
    requestId.current += 1
    setTicketId(null)
    setDetails('')
    setShortCode('')
  }, [])

  return {
    shortCode,
    setShortCode,
    reason,
    setReason,
    details,
    setDetails,
    reporterEmail,
    setReporterEmail,
    submitting,
    ticketId,
    handleReportSubmit,
    resetTicket,
  }
}
