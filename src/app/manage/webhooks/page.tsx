'use client';

import { useState, useEffect } from 'react';
import { Activity, Plus, Trash2, RefreshCw, Server } from 'lucide-react';

type Webhook = {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  _count?: {
    deliveries: number;
  };
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch('/api/webhooks')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setWebhooks(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) return;
    setAdding(true);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newUrl,
          events: ['click', 'conversion'], // default to all for now
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setWebhooks([created, ...webhooks]);
        setNewUrl('');
      }
    } finally {
      setAdding(false);
    }
  };

  const deleteWebhook = async (id: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;
    setWebhooks(webhooks.filter(w => w.id !== id));
    await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
  };

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

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold mb-4">Add Endpoint</h2>
        <form onSubmit={handleAdd} className="flex gap-4">
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://api.yourdomain.com/webhooks/quicklink"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
            required
          />
          <button
            type="submit"
            disabled={adding || !newUrl}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            {adding ? <Activity className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Endpoint
          </button>
        </form>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="h-32 bg-slate-900/50 rounded-2xl animate-pulse" />
        ) : webhooks.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-slate-800 border-dashed bg-slate-900/20 text-slate-400">
            <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No webhooks configured.</p>
          </div>
        ) : (
          webhooks.map((webhook) => (
            <div key={webhook.id} className="flex items-center justify-between p-5 rounded-2xl border border-slate-800 bg-slate-900">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className={`w-2 h-2 rounded-full ${webhook.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <h3 className="font-semibold">{webhook.url}</h3>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> {webhook.events.join(', ')}</span>
                  <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {webhook._count?.deliveries || 0} deliveries</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => deleteWebhook(webhook.id)}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
