'use client';

import { useState } from 'react';
import { Activity, Plus } from 'lucide-react';
import { sanitizeHandle, validateHandle } from './sanitizeHandle';

export function CreateProfileForm({
  creating,
  serverError,
  onCreate,
}: {
  creating: boolean;
  serverError: string | null;
  onCreate: (handle: string) => Promise<boolean>;
}) {
  const [newHandle, setNewHandle] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateHandle(newHandle);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError(null);
    const created = await onCreate(sanitizeHandle(newHandle.trim()));
    if (created) setNewHandle('');
  };

  const error = localError || serverError;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-md p-6">
      <h2 className="text-xl font-semibold mb-4">Create New Profile</h2>
      <form onSubmit={handleSubmit} className="flex gap-4">
        <div className="flex-1 flex items-center bg-slate-950 rounded-xl border border-slate-800 px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
          <span className="text-slate-500 mr-1 select-none">b/</span>
          <input
            type="text"
            value={newHandle}
            onChange={(e) => setNewHandle(sanitizeHandle(e.target.value))}
            placeholder="your-brand"
            className="bg-transparent border-none outline-none w-full text-slate-100 placeholder:text-slate-600"
            required
          />
        </div>
        <button
          type="submit"
          disabled={creating || !newHandle}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? <Activity className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          Create Page
        </button>
      </form>
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
    </div>
  );
}
