'use client';

import { Settings2 } from 'lucide-react';
import type { BioProfile, ProfileField } from './types';

export function ProfileForm({
  profile,
  onField,
}: {
  profile: BioProfile;
  onField: (field: ProfileField, value: string) => void;
}) {
  return (
    <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Settings2 className="w-5 h-5 text-blue-400" />
        Profile Details
      </h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Display Name</label>
          <input
            type="text"
            value={profile.displayName || ''}
            onChange={(e) => onField('displayName', e.target.value)}
            placeholder="@yourbrand"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Bio Text</label>
          <textarea
            value={profile.bioText || ''}
            onChange={(e) => onField('bioText', e.target.value)}
            placeholder="Welcome to my links!"
            rows={3}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-blue-500 transition-colors resize-none"
          />
        </div>
      </div>
    </section>
  );
}
