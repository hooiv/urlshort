import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Metadata } from 'next';

type Props = {
  params: Promise<{ shortCode: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shortCode } = await params;
  const url = await prisma.url.findUnique({ where: { shortCode } });
  if (!url) return { title: 'Not Found' };
  
  return {
    title: `Opening ${url.title || 'App'}...`,
  };
}

export default async function DeferredDeepLinkPage({ params, searchParams }: Props) {
  const { shortCode } = await params;
  
  const url = await prisma.url.findUnique({
    where: { shortCode },
  });

  if (!url) {
    notFound();
  }

  // The destinationUrl could be a custom URI scheme like `quicklink://promo/123`
  const appSchemeUrl = url.originalUrl;
  const iosStoreUrl = 'https://apps.apple.com/app/id123456789';
  const androidStoreUrl = 'https://play.google.com/store/apps/details?id=com.quicklink.app';
  const fallbackWebUrl = url.originalUrl.startsWith('http') ? url.originalUrl : '/';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
        <div className="w-20 h-20 bg-blue-500 rounded-2xl mx-auto flex items-center justify-center animate-pulse">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold">Opening App...</h1>
        <p className="text-slate-400">
          We're taking you directly to the content.
        </p>

        {/* Client side script to attempt deep link open and fallback to store */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var appUrl = ${JSON.stringify(appSchemeUrl)};
                var iosUrl = ${JSON.stringify(iosStoreUrl)};
                var androidUrl = ${JSON.stringify(androidStoreUrl)};
                var webUrl = ${JSON.stringify(fallbackWebUrl)};
                
                var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                var isAndroid = /android/i.test(navigator.userAgent);
                
                var start = Date.now();
                var fallbackTimer;
                
                // Attempt to open custom scheme
                if (appUrl.indexOf('http') !== 0) {
                  window.location.href = appUrl;
                  
                  // Set fallback timeout if app doesn't open
                  fallbackTimer = setTimeout(function() {
                    var now = Date.now();
                    // If it took longer than 3 seconds, app probably opened and suspended the browser
                    if (now - start < 3000) {
                      if (isIOS) window.location.href = iosUrl;
                      else if (isAndroid) window.location.href = androidUrl;
                      else window.location.href = webUrl;
                    }
                  }, 2500);
                } else {
                   // If it's just a web URL, redirect immediately
                   window.location.href = appUrl;
                }
                
                // Clear timeout if page hides
                window.addEventListener('pagehide', function() {
                  clearTimeout(fallbackTimer);
                });
                window.addEventListener('visibilitychange', function() {
                  if (document.hidden) clearTimeout(fallbackTimer);
                });
              })();
            `
          }}
        />

        <div className="pt-6">
          <p className="text-sm text-slate-500 mb-4">Nothing happened?</p>
          <div className="flex flex-col gap-3">
            <a href={appSchemeUrl} className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-3 font-medium transition-colors">
              Open App Manually
            </a>
            <a href={fallbackWebUrl} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl py-3 font-medium transition-colors">
              Continue in Browser
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
