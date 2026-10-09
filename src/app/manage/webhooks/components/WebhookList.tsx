'use client';

import { useState } from 'react';
import { DeliveryLog } from './DeliveryLog';
import { Activity, ListChecks, Filter, RefreshCw, Server, Trash2 } from 'lucide-react';
import { describeLinkScope } from './validateWebhook';
import { formatNumber } from '@/lib/format';
import type { Webhook } from './types';

export function WebhookList({
  webhooks,
  loading,
  loadError,
  onDelete,
}: {
  webhooks: Webhook[];
  loading: boolean;
  loadError: string | null;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {loading ? (
        <div className="h-32 bg-slate-900/50 rounded-2xl animate-pulse" />
      ) : loadError ? (
        <div className="text-center py-12 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300">
          <p>{loadError}</p>
        </div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-slate-800 border-dashed bg-slate-900/20 text-slate-400">
          <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No webhooks configured.</p>
        </div>
      ) : (
        webhooks.map((webhook) => (
          <div key={webhook.id} className="p-5 rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span
                  className={`w-2 h-2 rounded-full ${webhook.isActive ? 'bg-emerald-500' : 'bg-red-500'}`}
                />
                <h3 className="font-semibold">{webhook.url}</h3>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span className="flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> {webhook.events.join(', ')}
                </span>
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3" /> {formatNumber(webhook.deliveries)} deliveries
                </span>
                <span className="flex items-center gap-1">
                  <Filter className="w-3 h-3" /> {describeLinkScope(webhook)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setExpanded((current) => (current === webhook.id ? null : webhook.id))}
                aria-expanded={expanded === webhook.id}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <ListChecks className="w-4 h-4" /> Deliveries
              </button>
              <button
                onClick={() => void onDelete(webhook.id)}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
          {expanded === webhook.id ? <DeliveryLog endpointId={webhook.id} isActive={webhook.isActive} /> : null}
          </div>
        ))
      )}
    </div>
  );
}
