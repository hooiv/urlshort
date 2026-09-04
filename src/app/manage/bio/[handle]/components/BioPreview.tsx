'use client';

import type { BioBlock, BioProfile } from './types';

export function BioPreview({ profile, blocks }: { profile: BioProfile; blocks: BioBlock[] }) {
  return (
    <div className="w-1/2 lg:w-[40%] bg-slate-900 flex items-center justify-center p-8 relative overflow-hidden">
      {/* Phone Frame */}
      <div className="relative w-[320px] h-[650px] bg-black rounded-[40px] border-[8px] border-slate-800 shadow-2xl overflow-hidden ring-1 ring-slate-700/50">
        {/* Top Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-800 rounded-b-2xl z-20"></div>

        {/* Mock Screen Content */}
        <div className="absolute inset-0 bg-slate-950 overflow-y-auto no-scrollbar pb-10">
          <div className="px-6 py-12 flex flex-col items-center">
            <div className="w-20 h-20 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full mb-4 shadow-lg flex items-center justify-center text-2xl font-bold text-white">
              {profile.displayName?.charAt(0).toUpperCase() || profile.handle.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-xl font-bold text-white mb-2 text-center">
              {profile.displayName || `@${profile.handle}`}
            </h1>
            {profile.bioText && (
              <p className="text-sm text-slate-300 text-center mb-8 whitespace-pre-wrap leading-relaxed">
                {profile.bioText}
              </p>
            )}

            <div className="w-full space-y-4 mt-4">
              {blocks.map((block) => {
                if (block.type === 'link') {
                  return (
                    <div
                      key={block.id}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-white p-4 rounded-xl text-center font-medium transition-colors shadow-lg shadow-black/20 border border-slate-700"
                    >
                      {block.title || 'Untitled Link'}
                    </div>
                  );
                }
                if (block.type === 'text') {
                  return (
                    <div key={block.id} className="w-full py-4 text-center text-slate-200">
                      {block.content}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
