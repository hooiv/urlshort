'use client';

import { CreateProfileForm } from './components/CreateProfileForm';
import { ProfileGrid } from './components/ProfileGrid';
import { useBioProfiles } from './components/useBioProfiles';

export default function BioProfilesPage() {
  const { profiles, loading, loadError, creating, error, createProfile } = useBioProfiles();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Link-in-Bio</h1>
          <p className="text-slate-400 mt-1">Create beautiful, high-converting mobile landing pages.</p>
        </div>
      </div>

      <CreateProfileForm creating={creating} serverError={error} onCreate={createProfile} />

      <ProfileGrid profiles={profiles} loading={loading} loadError={loadError} />
    </div>
  );
}
