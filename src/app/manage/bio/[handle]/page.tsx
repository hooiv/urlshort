'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Plus, Trash2, GripVertical, Settings2, Eye, Activity } from 'lucide-react';
import Link from 'next/link';

type BioBlock = {
  id: string;
  type: string;
  position: number;
  title: string | null;
  url: string | null;
  content: string | null;
};

type Profile = {
  id: string;
  handle: string;
  displayName: string | null;
  bioText: string | null;
  avatarUrl: string | null;
  theme: string;
  blocks: BioBlock[];
};

export default function BioBuilderPage() {
  const params = useParams<{ handle: string }>();
  const router = useRouter();
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [blocks, setBlocks] = useState<BioBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!params?.handle) return;
    fetch(`/api/bio/${params.handle}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data) => {
        setProfile(data);
        setBlocks(data.blocks || []);
        setLoading(false);
      })
      .catch(() => {
        router.push('/manage/bio');
      });
  }, [params?.handle, router]);

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await fetch(`/api/bio/${profile.handle}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: profile.displayName,
          bioText: profile.bioText,
          theme: profile.theme,
          avatarUrl: profile.avatarUrl,
        }),
      });
      // In a real app we'd also batch update blocks positions
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const addBlock = async (type: string) => {
    if (!profile) return;
    const res = await fetch(`/api/bio/${profile.handle}/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        title: type === 'link' ? 'New Link' : undefined,
      }),
    });
    if (res.ok) {
      const newBlock = await res.json();
      setBlocks([...blocks, newBlock]);
    }
  };

  const updateBlock = async (id: string, updates: Partial<BioBlock>) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
    
    // Optimistic update, but we should debounce real save
    await fetch(`/api/bio/blocks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  };

  const deleteBlock = async (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
    await fetch(`/api/bio/blocks/${id}`, {
      method: 'DELETE',
    });
  };

  if (loading || !profile) {
    return <div className="flex justify-center p-20"><Activity className="animate-spin text-slate-500 w-8 h-8" /></div>;
  }

  return (
    <div className="flex h-[calc(100vh-80px)] -m-8">
      {/* Sidebar Editor */}
      <div className="w-1/2 lg:w-[60%] border-r border-slate-800 bg-slate-950 p-8 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <Link href="/manage/bio" className="flex items-center text-slate-400 hover:text-white transition-colors">
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
              {saving ? <Activity className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </button>
          </div>
        </div>

        <div className="space-y-8 max-w-xl mx-auto">
          {/* Profile Section */}
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
                  onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                  placeholder="@yourbrand"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Bio Text</label>
                <textarea
                  value={profile.bioText || ''}
                  onChange={(e) => setProfile({ ...profile, bioText: e.target.value })}
                  placeholder="Welcome to my links!"
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                />
              </div>
            </div>
          </section>

          {/* Blocks Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Links & Blocks</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => addBlock('link')}
                  className="flex items-center px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-700"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Link
                </button>
                <button
                  onClick={() => addBlock('text')}
                  className="flex items-center px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-700"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Text
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {blocks.map((block) => (
                <div key={block.id} className="group relative bg-slate-900 border border-slate-800 rounded-xl p-4 flex gap-4 transition-all focus-within:border-blue-500/50">
                  <div className="mt-2 text-slate-600 cursor-grab hover:text-slate-400">
                    <GripVertical className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1 space-y-3">
                    {block.type === 'link' ? (
                      <>
                        <input
                          type="text"
                          value={block.title || ''}
                          onChange={(e) => updateBlock(block.id, { title: e.target.value })}
                          placeholder="Title"
                          className="w-full bg-transparent border-none text-slate-100 font-medium placeholder:text-slate-500 focus:outline-none focus:ring-0 p-0"
                        />
                        <input
                          type="url"
                          value={block.url || ''}
                          onChange={(e) => updateBlock(block.id, { url: e.target.value })}
                          placeholder="https://example.com"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                      </>
                    ) : (
                      <>
                        <textarea
                          value={block.content || ''}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                          placeholder="Text content..."
                          className="w-full bg-transparent border-none text-slate-300 placeholder:text-slate-500 focus:outline-none focus:ring-0 p-0 resize-none h-20"
                        />
                      </>
                    )}
                  </div>

                  <button
                    onClick={() => deleteBlock(block.id)}
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
        </div>
      </div>

      {/* Live Preview Pane */}
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
                      <div key={block.id} className="w-full bg-slate-800 hover:bg-slate-700 text-white p-4 rounded-xl text-center font-medium transition-colors shadow-lg shadow-black/20 border border-slate-700">
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
    </div>
  );
}
