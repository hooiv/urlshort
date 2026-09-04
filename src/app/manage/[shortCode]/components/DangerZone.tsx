'use client'

import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ShieldAlert } from 'lucide-react'

export default function DangerZone({ onDeleteLink }: { onDeleteLink: () => Promise<void> }) {
  const router = useRouter()

  return (
    <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
      <div className="flex items-center gap-2 text-red-400">
        <ShieldAlert className="h-5 w-5" />
        <h2 className="font-semibold">Danger Zone</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">Destructive actions for this campaign link.</p>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-red-500/20 bg-slate-950 p-4">
        <div>
          <div className="text-sm font-medium text-slate-200">Delete Link Permanently</div>
          <div className="text-xs text-slate-500">
            Deletes this short link, routing rules, and associated analytics history.
          </div>
        </div>
        <button
          onClick={() => {
            if (!window.confirm('Permanent action: Delete this link and all its history?')) return
            void (async () => {
              try {
                await onDeleteLink()
                toast.success('Link deleted')
                setTimeout(() => {
                  router.push('/')
                }, 1000)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Delete failed')
              }
            })()
          }}
          className="shrink-0 rounded-xl bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-600"
        >
          Delete Link
        </button>
      </div>
    </section>
  )
}
