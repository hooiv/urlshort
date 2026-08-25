import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shortCode: string }> }
) {
  try {
    const { shortCode } = await params;
    const url = await prisma.url.findUnique({
      where: { shortCode },
      select: { title: true, description: true, shortCode: true, originalUrl: true }
    });

    if (!url) {
      return new Response('Not found', { status: 404 });
    }

    const title = url.title || url.originalUrl;
    const description = url.description || `quicklink.to/${url.shortCode}`;

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            backgroundColor: '#020617', // slate-950
            padding: '80px',
            fontFamily: 'sans-serif',
          }}
        >
          {/* Logo / Brand */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '40px',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                backgroundColor: '#3b82f6', // blue-500
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '24px',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
            </div>
            <span style={{ fontSize: '48px', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
              QuickLink
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <h1
              style={{
                fontSize: '72px',
                fontWeight: 900,
                color: 'white',
                lineHeight: 1.1,
                margin: 0,
                letterSpacing: '-0.03em',
                maxWidth: '900px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {title}
            </h1>
            
            {description && (
              <p
                style={{
                  fontSize: '36px',
                  color: '#94a3b8', // slate-400
                  lineHeight: 1.4,
                  margin: 0,
                  maxWidth: '900px',
                }}
              >
                {description}
              </p>
            )}
          </div>
          
          <div
            style={{
              display: 'flex',
              marginTop: 'auto',
              alignItems: 'center',
              color: '#3b82f6',
              fontSize: '32px',
              fontWeight: 600,
            }}
          >
            quicklink.to/{url.shortCode}
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e: any) {
    console.error(e);
    return new Response('Failed to generate image', { status: 500 });
  }
}
