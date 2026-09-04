import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { requireWorkspaceRole, EDIT_ROLES } from '@/lib/workspaces';
import { rateLimit } from '@/lib/rate-limit';

export const MAX_BIO_BLOCKS = 100;

export const bioBlockSchema = z.object({
  type: z.enum(['link', 'socials', 'text', 'image', 'youtube', 'spotify', 'divider']),
  title: z.string().trim().max(160).nullish(),
  url: z.string().trim().max(2048).nullish(),
  content: z.string().trim().max(2000).nullish(),
  metadataJson: z.string().max(10000).nullish(),
});

export function isSafeBlockUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = await rateLimit(request, { name: 'bio-block-create', limit: 60, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { handle: rawHandle } = await params;
    const handle = typeof rawHandle === 'string' ? rawHandle.trim().toLowerCase() : '';
    const parsed = bioBlockSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !handle) return NextResponse.json({ error: 'Invalid block data' }, { status: 400 });
    const { type, title, url, content, metadataJson } = parsed.data;
    if (url && !isSafeBlockUrl(url)) return NextResponse.json({ error: 'Block URL must be a valid http(s) URL' }, { status: 400 });

    const profile = await prisma.bioProfile.findUnique({
      where: { handle },
      include: {
        _count: {
          select: { blocks: true },
        },
      },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.userId) {
      if (profile.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    } else if (profile.workspaceId) {
      const access = await requireWorkspaceRole(request, profile.workspaceId, EDIT_ROLES);
      if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (profile._count.blocks >= MAX_BIO_BLOCKS) {
      return NextResponse.json({ error: 'Block limit reached' }, { status: 400 });
    }

    const block = await prisma.bioBlock.create({
      data: {
        profileId: profile.id,
        type,
        position: profile._count.blocks,
        title,
        url,
        content,
        metadataJson,
      },
    });

    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    console.error('Error creating bio block:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
