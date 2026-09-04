'use client'

import { useState } from 'react'
import type { Campaign, CampaignAction } from './types'
import { CampaignCard } from './CampaignCard'
import { CampaignEmptyState, CampaignErrorState, CampaignLoadingState } from './CampaignStates'

export function CampaignList({
  campaigns,
  loading,
  error,
  busyId,
  onAction,
  onRetry,
}: {
  campaigns: Campaign[]
  loading: boolean
  error: string | null
  busyId: string | null
  onAction: (id: string, action: CampaignAction) => void
  onRetry: () => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (loading) return <CampaignLoadingState />
  if (error) return <CampaignErrorState message={error} onRetry={onRetry} />
  if (campaigns.length === 0) return <CampaignEmptyState />

  return (
    <div className="space-y-4">
      {campaigns.map((campaign) => (
        <CampaignCard
          key={campaign.id}
          campaign={campaign}
          busy={busyId === campaign.id}
          expanded={expandedId === campaign.id}
          onToggle={() => setExpandedId(expandedId === campaign.id ? null : campaign.id)}
          onAction={(action) => onAction(campaign.id, action)}
        />
      ))}
    </div>
  )
}
