'use client';

import Link from 'next/link';
import { Activity, ArrowLeft, Eye, Save } from 'lucide-react';
import { BioPreview } from './components/BioPreview';
import { BlockList } from './components/BlockList';
import { ProfileForm } from './components/ProfileForm';
import { useBioBuilder } from './components/useBioBuilder';

export default function BioBuilderPage() {
  const {
    profile,
    blocks,
    loading,
    saving,
    saveError,
    blockUrlErrors,
    updateProfileField,
    saveProfile,
    addBlock,
    updateBlock,
    deleteBlock,
  } = useBioBuilder();

  if (loading || !profile) {
    return (
      <div className="flex justify-center p-20">
        <Activity className="animate-spin text-slate-500 w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-80px)] -m-8">
      {/* Sidebar Editor */}
      <div className="w-1/2 lg:w-[60%] border-r border-slate-800 bg-slate-950 p-8 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/manage/bio"
            className="flex items-center text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Bio Pages
          </Link>
          <div className="flex gap-3">
            <Link
              href={`/b/${profile.handle}`}
              target="_blank"
              className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors border border-slate-700"
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Link>
            <button
              onClick={saveProfile}
              disabled={saving}
              className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? (
                <Activity className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </button>
          </div>
        </div>

        {saveError && (
          <p className="max-w-xl mx-auto mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">
            {saveError}
          </p>
        )}

        <div className="space-y-8 max-w-xl mx-auto">
          <ProfileForm profile={profile} onField={updateProfileField} />
          <BlockList
            blocks={blocks}
            urlErrors={blockUrlErrors}
            onAdd={addBlock}
            onUpdate={updateBlock}
            onDelete={deleteBlock}
          />
        </div>
      </div>

      {/* Live Preview Pane */}
      <BioPreview profile={profile} blocks={blocks} />
    </div>
  );
}
