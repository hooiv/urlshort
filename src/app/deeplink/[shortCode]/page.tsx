import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import type { Metadata } from 'next'
import DeepLinkClient from '@/app/deeplink/[shortCode]/components/DeepLinkClient'

type Props = { params: Promise<{ shortCode: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shortCode } = await params
  const url = await prisma.url.findUnique({ where: { shortCode }, select: { title: true } })
  return { title: url ? `Opening ${url.title || 'App'}...` : 'Not Found' }
}

export default async function DeferredDeepLinkPage({ params }: Props) {
  const { shortCode } = await params
  const exists = await prisma.url.findUnique({ where: { shortCode }, select: { id: true } })
  if (!exists) notFound()
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <DeepLinkClient shortCode={shortCode} />
    </main>
  )
}
