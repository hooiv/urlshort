'use client';

import Link from 'next/link';
import { ExternalLink, Link2 } from 'lucide-react';
import type { BioProfileSummary } from './types';

export function ProfileGrid({
  profiles,
  loading,
  loadError,
}: {
  profiles: BioProfileSummary[];
  loading: boolean;
  loadError: string | null;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Your Pages</h2>
      {loading ? (
        <div className="h-32 rounded-2xl border border-slate-800 bg-slate-900/50 animate-pulse" />
      ) : loadError ? (
        <div className="text-center py-12 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300">
          <p>{loadError}</p>
        </div>
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
                  <h3 className="font-semibold text-lg">{profile.displayName || `@${profile.handle}`}</h3>
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
  );
}
