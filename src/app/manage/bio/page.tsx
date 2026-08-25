'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Link2, ExternalLink, Activity } from 'lucide-react';

type Profile = {
  id: string;
  handle: string;
  displayName: string | null;
  theme: string;
  createdAt: string;
};

export default function BioProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHandle, setNewHandle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/bio')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProfiles(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/bio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: newHandle }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create profile');
      }
      const created = await res.json();
      setProfiles([created, ...profiles]);
      setNewHandle('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Link-in-Bio</h1>
          <p className="text-slate-400 mt-1">
            Create beautiful, high-converting mobile landing pages.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-md p-6">
        <h2 className="text-xl font-semibold mb-4">Create New Profile</h2>
        <form onSubmit={handleCreate} className="flex gap-4">
          <div className="flex-1 flex items-center bg-slate-950 rounded-xl border border-slate-800 px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
            <span className="text-slate-500 mr-1 select-none">b/</span>
            <input
              type="text"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
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
            {creating ? (
              <Activity className="w-5 h-5 animate-spin" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
            Create Page
          </button>
        </form>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your Pages</h2>
        {loading ? (
          <div className="h-32 rounded-2xl border border-slate-800 bg-slate-900/50 animate-pulse" />
        ) : profiles.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-slate-800 border-dashed bg-slate-900/20 text-slate-400">
            <Link2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No bio pages created yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="group flex flex-col justify-between p-5 rounded-2xl border border-slate-800 bg-slate-900 hover:bg-slate-800/80 transition-colors"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-lg">
                      {profile.displayName || `@${profile.handle}`}
                    </h3>
                    <Link
                      href={`/b/${profile.handle}`}
                      target="_blank"
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700/50 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                  <p className="text-slate-400 text-sm mb-4">b/{profile.handle}</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/manage/bio/${profile.handle}`}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-center text-sm font-medium py-2 rounded-lg transition-colors border border-slate-700"
                  >
                    Edit Page
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
