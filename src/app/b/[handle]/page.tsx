import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Image from 'next/image';
import { Metadata } from 'next';
import Link from 'next/link';

type Props = {
  params: Promise<{ handle: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await prisma.bioProfile.findUnique({
    where: { handle },
  });

  if (!profile) return { title: 'Not Found' };

  return {
    title: `${profile.displayName || `@${profile.handle}`} | Links`,
    description: profile.bioText || `Links for @${profile.handle}`,
    openGraph: {
      title: `${profile.displayName || `@${profile.handle}`}`,
      description: profile.bioText || undefined,
    },
  };
}

export default async function PublicBioPage({ params }: Props) {
  const { handle } = await params;
  
  const profile = await prisma.bioProfile.findUnique({
    where: { handle },
    include: {
      blocks: {
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!profile) {
    notFound();
  }

  // Base theme classes, can be extended by `theme` column (e.g. 'dark', 'light', 'glass')
  const themeClasses = profile.theme === 'light' 
    ? 'bg-slate-50 text-slate-900' 
    : 'bg-slate-950 text-slate-100';

  const blockThemeClasses = profile.theme === 'light'
    ? 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200'
    : 'bg-slate-900 hover:bg-slate-800 text-slate-100 border-slate-800';

  return (
    <div className={`min-h-screen ${themeClasses} px-4 py-16 flex flex-col items-center`}>
      <div className="w-full max-w-xl mx-auto space-y-8 flex flex-col items-center">
        
        {/* Profile Header */}
        <div className="text-center space-y-4">
          {profile.avatarUrl ? (
            <Image 
              src={profile.avatarUrl} 
              alt={profile.handle}
              width={96}
              height={96}
              className="rounded-full mx-auto shadow-lg object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-full mx-auto shadow-lg bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-3xl font-bold text-white">
              {profile.displayName?.charAt(0).toUpperCase() || profile.handle.charAt(0).toUpperCase()}
            </div>
          )}
          
          <h1 className="text-2xl font-bold tracking-tight">
            {profile.displayName || `@${profile.handle}`}
          </h1>
          
          {profile.bioText && (
            <p className="text-sm opacity-80 whitespace-pre-wrap max-w-md mx-auto">
              {profile.bioText}
            </p>
          )}
        </div>

        {/* Blocks */}
        <div className="w-full space-y-4">
          {profile.blocks.map((block) => {
            if (block.type === 'link') {
              return (
                <a
                  key={block.id}
                  href={block.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block w-full p-4 rounded-2xl border ${blockThemeClasses} text-center font-semibold transition-all hover:scale-[1.02] shadow-sm`}
                >
                  {block.title || block.url}
                </a>
              );
            }
            if (block.type === 'text') {
              return (
                <div key={block.id} className="py-4 text-center opacity-90 max-w-md mx-auto">
                  {block.content}
                </div>
              );
            }
            return null;
          })}
        </div>

        {/* Branding Footer */}
        <div className="pt-12 pb-4 text-center">
          <Link href="/" className="text-xs font-semibold opacity-50 hover:opacity-100 transition-opacity">
            Powered by QuickLink
          </Link>
        </div>
      </div>
    </div>
  );
}
