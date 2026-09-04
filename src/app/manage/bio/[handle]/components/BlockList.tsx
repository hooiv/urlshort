'use client';

import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { BioBlock } from './types';

export function BlockList({
  blocks,
  urlErrors,
  onAdd,
  onUpdate,
  onDelete,
}: {
  blocks: BioBlock[];
  urlErrors: Record<string, string | null>;
  onAdd: (type: string) => void;
  onUpdate: (id: string, updates: Partial<BioBlock>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Links & Blocks</h2>
        <div className="flex gap-2">
          <button
            onClick={() => onAdd('link')}
            className="flex items-center px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-700"
          >
            <Plus className="w-4 h-4 mr-1" /> Add Link
          </button>
          <button
            onClick={() => onAdd('text')}
            className="flex items-center px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-700"
          >
            <Plus className="w-4 h-4 mr-1" /> Add Text
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {blocks.map((block) => (
          <div
            key={block.id}
            className="group relative bg-slate-900 border border-slate-800 rounded-xl p-4 flex gap-4 transition-all focus-within:border-blue-500/50"
          >
            <div className="mt-2 text-slate-600 cursor-grab hover:text-slate-400">
              <GripVertical className="w-5 h-5" />
            </div>

            <div className="flex-1 space-y-3">
              {block.type === 'link' ? (
                <>
                  <input
                    type="text"
                    value={block.title || ''}
                    onChange={(e) => onUpdate(block.id, { title: e.target.value })}
                    placeholder="Title"
                    className="w-full bg-transparent border-none text-slate-100 font-medium placeholder:text-slate-500 focus:outline-none focus:ring-0 p-0"
                  />
                  <input
                    type="url"
                    value={block.url || ''}
                    onChange={(e) => onUpdate(block.id, { url: e.target.value })}
                    placeholder="https://example.com"
                    aria-invalid={Boolean(urlErrors[block.id])}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  {urlErrors[block.id] && (
                    <p className="text-red-400 text-xs">{urlErrors[block.id]}</p>
                  )}
                </>
              ) : (
                <>
                  <textarea
                    value={block.content || ''}
                    onChange={(e) => onUpdate(block.id, { content: e.target.value })}
                    placeholder="Text content..."
                    className="w-full bg-transparent border-none text-slate-300 placeholder:text-slate-500 focus:outline-none focus:ring-0 p-0 resize-none h-20"
                  />
                </>
              )}
            </div>

            <button
              onClick={() => onDelete(block.id)}
              className="opacity-0 group-hover:opacity-100 absolute top-4 right-4 p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {blocks.length === 0 && (
          <div className="text-center py-12 border border-slate-800 border-dashed rounded-xl bg-slate-900/20 text-slate-500">
            <p>No blocks added yet.</p>
            <p className="text-sm mt-1">Click the buttons above to add your first link.</p>
          </div>
        )}
      </div>
    </section>
  );
}
