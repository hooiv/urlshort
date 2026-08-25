/**
 * Email delivery abstraction.
 *
 * Providers are selected via the `EMAIL_PROVIDER` env var:
 *  - unset / "console" → log to server console (development & self-host default)
 *  - "resend"          → Resend HTTP API (RESEND_API_KEY required)
 *
 * All sends are fire-and-forget safe: callers await this module, but a failed
 * send never throws into the request path — it logs and resolves.
 */

export type EmailMessage = {
  to: string
  subject: string
  text: string
}

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const provider = (process.env.EMAIL_PROVIDER || 'console').toLowerCase()
  try {
    switch (provider) {
      case 'resend':
        return await sendViaResend(message)
      case 'console':
      default:
        console.info(`[email:console] to=${message.to} subject="${message.subject}"\n${message.text}`)
        return true
    }
  } catch (error) {
    console.error(`[email] delivery failed via ${provider}:`, error)
    return false
  }
}

async function sendViaResend(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[email:resend] RESEND_API_KEY is not set — falling back to console delivery')
    console.info(`[email:console] to=${message.to} subject="${message.subject}"\n${message.text}`)
    return false
  }
  const from = process.env.EMAIL_FROM || 'QuickLink <onboarding@resend.dev>'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
  })
  if (!response.ok) {
    console.error(`[email:resend] send failed: ${response.status} ${await response.text().catch(() => '')}`)
    return false
  }
  return true
}

export function renderWorkspaceInviteEmail(params: { workspaceName: string; role: string; inviteUrl: string; invitedEmail: string }): EmailMessage {
  return {
    to: params.invitedEmail,
    subject: `You've been invited to ${params.workspaceName} on QuickLink`,
    text: [
      `You've been invited to join "${params.workspaceName}" as ${params.role}.`,
      '',
      `Accept your invitation: ${params.inviteUrl}`,
      '',
      'The link expires in 7 days. You must be signed in as',
      params.invitedEmail,
      'for the invitation to work.',
    ].join('\n'),
  }
}

export function renderPasswordResetEmail(params: { resetUrl: string }): EmailMessage {
  return {
    to: '',
    subject: 'Reset your QuickLink password',
    text: [
      'We received a request to reset your QuickLink password.',
      '',
      `Reset link (valid for 1 hour): ${params.resetUrl}`,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n'),
  }
}

export function renderEmailVerificationEmail(params: { verifyUrl: string }): EmailMessage {
  return {
    to: '',
    subject: 'Verify your QuickLink email address',
    text: [
      'Welcome to QuickLink! Confirm your email address to finish setting up your account.',
      '',
      `Verify link (valid for 24 hours): ${params.verifyUrl}`,
      '',
      'If you did not create this account, you can safely ignore this email.',
    ].join('\n'),
  }
}
