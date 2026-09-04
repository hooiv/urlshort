'use client'

import { isSafeHttpUrl } from '@/app/components/shorten-logic'

interface Props {
  title: string
  description: string
  ogImage: string
}

export default function SocialPreview({ title, description, ogImage }: Props) {
  const safeImage = ogImage.trim() && isSafeHttpUrl(ogImage.trim()) ? ogImage.trim() : ''
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Live Social Card Simulator
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-black text-slate-200">
        {safeImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={safeImage} alt="OG Card" className="h-40 w-full object-cover" />
        )}
        <div className="p-3">
          <div className="font-mono text-[10px] text-slate-500">
            {typeof window !== 'undefined' ? window.location.hostname : 'quicklink.to'}
          </div>
          <div className="font-bold text-sm text-white line-clamp-1">{title || 'Campaign Title'}</div>
          <div className="text-xs text-slate-400 line-clamp-2 mt-0.5">
            {description || 'Campaign description will appear here for visitors.'}
          </div>
        </div>
      </div>
    </div>
  )
}
