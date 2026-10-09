'use client';

import { useEffect, useState } from 'react';
import { useWritableFolders } from '@/components/FolderPicker';
import { Activity, Check, Copy, Plus } from 'lucide-react';
import type { WebhookLinkFilter, WebhookLinkScope } from './types';
import { parseFilterList } from './validateWebhook';

export function AddWebhookForm({
  adding,
  serverError,
  createdSecret,
  onClearSecret,
  onAdd,
}: {
  adding: boolean;
  serverError: string | null;
  createdSecret: string | null;
  onClearSecret: () => void;
  onAdd: (url: string, filter: WebhookLinkFilter) => Promise<boolean>;
}) {
  const [newUrl, setNewUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkScope, setLinkScope] = useState<WebhookLinkScope>('all');
  const [filterText, setFilterText] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [adminWorkspaces, setAdminWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [folderIds, setFolderIds] = useState<string[]>([]);
  // Admins see every folder, so "writable" is the full list here.
  const folders = useWritableFolders(workspaceId || null);

  useEffect(() => {
    fetch('/api/workspaces')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: Array<{ id: string; name: string; role: string }>) =>
        setAdminWorkspaces(Array.isArray(rows) ? rows.filter((w) => w.role === 'owner' || w.role === 'admin') : []),
      )
      .catch(() => undefined);
  }, []);

  const filterValues = parseFilterList(filterText);
  const filterIncomplete =
    linkScope === 'folders' ? folderIds.length === 0 : linkScope !== 'all' && filterValues.length === 0;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl || filterIncomplete) return;
    const added = await onAdd(newUrl, {
      linkScope,
      tags: linkScope === 'tags' ? filterValues : [],
      shortCodes: linkScope === 'links' ? filterValues.map((code) => code.replace(/^\//, '')) : [],
      folderIds: linkScope === 'folders' ? folderIds : [],
      workspaceId: workspaceId || null,
    });
    if (added) {
      setNewUrl('');
      setFilterText('');
      setFolderIds([]);
      setLinkScope('all');
    }
  };

  const copySecret = async () => {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the secret remains visible for manual copy.
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-lg font-semibold mb-4">Add Endpoint</h2>
      <form onSubmit={handleAdd} className="space-y-3">
        <div className="flex gap-4">
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
          disabled={adding || !newUrl || filterIncomplete}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl transition-colors disabled:opacity-50"
        >
          {adding ? <Activity className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Endpoint
        </button>
        </div>
        {adminWorkspaces.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="webhook-owner" className="text-sm text-slate-400 shrink-0">
              Owned by
            </label>
            <select
              id="webhook-owner"
              value={workspaceId}
              onChange={(e) => {
                setWorkspaceId(e.target.value);
                setFolderIds([]);
                if (!e.target.value && linkScope === 'folders') setLinkScope('all');
              }}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="">Me (links I create)</option>
              {adminWorkspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} (every workspace link)
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="webhook-scope" className="text-sm text-slate-400 shrink-0">
            Fire for
          </label>
          <select
            id="webhook-scope"
            value={linkScope}
            onChange={(e) => setLinkScope(e.target.value as WebhookLinkScope)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All links</option>
            <option value="tags">Links with tags…</option>
            <option value="links">Specific links…</option>
            {workspaceId && <option value="folders">Links in folders…</option>}
          </select>
          {linkScope === 'folders' && (
            <div className="flex flex-1 flex-wrap gap-2" role="group" aria-label="Folders">
              {folders.length === 0 && <span className="text-xs text-slate-500">This workspace has no folders yet.</span>}
              {folders.map((folder) => {
                const on = folderIds.includes(folder.id);
                return (
                  <button
                    key={folder.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFolderIds((ids) => (on ? ids.filter((id) => id !== folder.id) : [...ids, folder.id]))}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-blue-500 bg-blue-500/20 text-blue-100' : 'border-slate-700 text-slate-400 hover:text-white'}`}
                  >
                    {folder.restricted ? '🔒 ' : ''}
                    {folder.name}
                  </button>
                );
              })}
            </div>
          )}
          {linkScope !== 'all' && linkScope !== 'folders' && (
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={linkScope === 'tags' ? 'launch, newsletter' : 'spring-sale, /promo'}
              aria-label={linkScope === 'tags' ? 'Tags, comma separated' : 'Short codes, comma separated'}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          )}
        </div>
      </form>
      {serverError && <p className="text-red-400 text-sm mt-3">{serverError}</p>}
      {createdSecret && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-200">
            Endpoint created — copy your signing secret now. It will not be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200">
              {createdSecret}
            </code>
            <button
              onClick={() => void copySecret()}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={onClearSecret}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
