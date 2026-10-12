'use client';

import { Server } from 'lucide-react';
import { AddWebhookForm } from './components/AddWebhookForm';
import { WebhookList } from './components/WebhookList';
import { SlackSettings } from './components/SlackSettings';
import { useWebhooks } from './components/useWebhooks';

export default function WebhooksPage() {
  const {
    webhooks,
    loading,
    loadError,
    adding,
    error,
    createdSecret,
    clearSecret,
    addWebhook,
    deleteWebhook,
    connectSlack,
    updateWebhook,
    testWebhook,
  } = useWebhooks();

  const deleteSlack = (id: string) => deleteWebhook(id, true);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Server className="w-8 h-8 text-blue-500" />
            Webhooks & DLQ
          </h1>
          <p className="text-slate-400 mt-1">
            Real-time event streaming for clicks and conversions with exponential backoff.
          </p>
        </div>
      </div>

      <SlackSettings
        webhooks={webhooks}
        onConnect={connectSlack}
        onUpdate={updateWebhook}
        onTest={testWebhook}
        onDisconnect={deleteSlack}
      />

      <AddWebhookForm
        adding={adding}
        serverError={error}
        createdSecret={createdSecret}
        onClearSecret={clearSecret}
        onAdd={addWebhook}
      />

      <WebhookList webhooks={webhooks} loading={loading} loadError={loadError} onDelete={deleteWebhook} />
    </div>
  );
}
