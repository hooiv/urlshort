'use client'

import RuleConflictGraph from '@/components/RuleConflictGraph'
import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Toaster } from 'react-hot-toast'
import { useCampaignControls } from '@/app/manage/[shortCode]/hooks/useCampaignControls'
import { findRollbackTarget } from '@/app/manage/[shortCode]/components/campaign-utils'
import StudioHeader from '@/app/manage/[shortCode]/components/StudioHeader'
import StudioBanner from '@/app/manage/[shortCode]/components/StudioBanner'
import DestinationSection from '@/app/manage/[shortCode]/components/DestinationSection'
import SocialCardSimulator from '@/app/manage/[shortCode]/components/SocialCardSimulator'
import UtmBuilder from '@/app/manage/[shortCode]/components/UtmBuilder'
import RoutingRulesEditor from '@/app/manage/[shortCode]/components/RoutingRulesEditor'
import RoutingSimulator from '@/app/manage/[shortCode]/components/RoutingSimulator'
import WebhookSection from '@/app/manage/[shortCode]/components/WebhookSection'
import PixelsCloakingSection from '@/app/manage/[shortCode]/components/PixelsCloakingSection'
import ExpirationSection from '@/app/manage/[shortCode]/components/ExpirationSection'
import TagsSection from '@/app/manage/[shortCode]/components/TagsSection'
import DangerZone from '@/app/manage/[shortCode]/components/DangerZone'
import AccessDenied from '@/app/manage/[shortCode]/components/AccessDenied'

export default function ManageLink() {
  const { shortCode } = useParams<{ shortCode: string }>()
  const controls = useCampaignControls(shortCode)

  const rollbackTarget = useMemo(
    () => (controls.liveRevision ? findRollbackTarget(controls.revisions, controls.liveRevision.id) : undefined),
    [controls.liveRevision, controls.revisions],
  )

  if (controls.token === null) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">Loading…</div>
  }
  if (!controls.token) {
    return <AccessDenied shortCode={shortCode} />
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Toaster position="top-right" />

      <StudioHeader shortCode={shortCode} />

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <StudioBanner />

        <DestinationSection
          releaseUrl={controls.releaseUrl}
          onReleaseUrlChange={controls.setReleaseUrl}
          liveRevision={controls.liveRevision}
          rollbackTarget={rollbackTarget}
          rollbackDisabled={controls.revisions.length < 2}
          onPublish={() => void controls.publishRelease()}
          onRollback={(revision) => void controls.rollback(revision)}
        />

        <SocialCardSimulator
          ogTitle={controls.ogTitle}
          ogDesc={controls.ogDesc}
          ogImage={controls.ogImage}
          onOgTitleChange={controls.setOgTitle}
          onOgDescChange={controls.setOgDesc}
          onOgImageChange={controls.setOgImage}
          socialTab={controls.socialTab}
          onSocialTabChange={controls.setSocialTab}
          onSave={() => void controls.saveMetadata()}
        />

        <UtmBuilder
          utmSource={controls.utmSource}
          utmMedium={controls.utmMedium}
          utmCampaign={controls.utmCampaign}
          onUtmSourceChange={controls.setUtmSource}
          onUtmMediumChange={controls.setUtmMedium}
          onUtmCampaignChange={controls.setUtmCampaign}
          generatedUtmUrl={controls.generatedUtmUrl}
          onPreset={(source, medium, campaign) => controls.applyUtmPreset(source, medium, campaign)}
        />

        <RoutingRulesEditor
          form={controls.form}
          onFormChange={controls.setForm}
          busy={controls.busy}
          rules={controls.rules}
          onSubmit={(event) => void controls.addRule(event)}
          onToggleRule={(rule) => void controls.toggleRule(rule)}
          onDeleteRule={(rule) => void controls.deleteRule(rule)}
        />

        <RoutingSimulator
          preview={controls.preview}
          onPreviewChange={controls.setPreview}
          busy={controls.previewBusy}
          result={controls.previewResult}
          onEvaluate={() => void controls.previewRouting()}
        />

        {/* Webhooks & Retargeting Pixels */}
        <section className="grid gap-8 lg:grid-cols-2">
          <WebhookSection
            webhookUrl={controls.webhookUrl}
            onWebhookUrlChange={controls.setWebhookUrl}
            onSave={() => void controls.saveWebhook()}
            onTest={() => void controls.testWebhook()}
            testing={controls.webhookTestBusy}
            result={controls.webhookTestResult}
          />
          <PixelsCloakingSection
            metaPixelId={controls.metaPixelId}
            googleTagId={controls.googleTagId}
            xPixelId={controls.xPixelId}
            onMetaPixelIdChange={controls.setMetaPixelId}
            onGoogleTagIdChange={controls.setGoogleTagId}
            onXPixelIdChange={controls.setXPixelId}
            cloaked={controls.cloaked}
            onToggleCloaking={(enabled) => void controls.toggleCloaking(enabled)}
            onSave={() => void controls.savePixels()}
          />
        </section>

        <ExpirationSection
          expiresAt={controls.expiresAt}
          expiredUrl={controls.expiredUrl}
          maxClicks={controls.maxClicks}
          password={controls.password}
          hasPassword={controls.hasPassword}
          onExpiresAtChange={controls.setExpiresAt}
          onExpiredUrlChange={controls.setExpiredUrl}
          onMaxClicksChange={controls.setMaxClicks}
          onPasswordChange={controls.setPassword}
          onSaveExpiration={() => void controls.saveExpiration()}
          onSavePassword={() => void controls.savePassword()}
        />

        <TagsSection
          tags={controls.tags}
          tagInput={controls.tagInput}
          onTagInputChange={controls.setTagInput}
          onUpdateTags={(tags) => void controls.updateTags(tags)}
        />

        <DangerZone onDeleteLink={() => controls.deleteLink()} />

        <RuleConflictGraph shortCode={shortCode} />
      </main>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(51 65 85);
          background: rgb(15 23 42);
          padding: 0.65rem 0.85rem;
          font-size: 0.875rem;
          color: rgb(241 245 249);
          outline: none;
          transition: all 0.15s ease;
        }
        .input:focus {
          border-color: rgb(96 165 250);
          box-shadow: 0 0 0 3px rgb(59 130 246 / 0.15);
        }
      `}</style>
    </div>
  )
}
