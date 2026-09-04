import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { requireWorkspaceRole, EDIT_ROLES } from '@/lib/workspaces';
import { rateLimit } from '@/lib/rate-limit';

export const bioBlockUpdateSchema = z.object({
  title: z.string().trim().max(160).nullish(),
  url: z.string().trim().max(2048).nullish(),
  content: z.string().trim().max(2000).nullish(),
  metadataJson: z.string().max(10000).nullish(),
  position: z.number().int().min(0).max(1000).nullish(),
});

export function isSafeBlockUpdateUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}


export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = await rateLimit(request, { name: 'bio-block-update', limit: 60, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { id } = await params;
    const parsed = bioBlockUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid block data' }, { status: 400 });
    const json = parsed.data;
    if (json.url && !isSafeBlockUpdateUrl(json.url)) {
      return NextResponse.json({ error: 'Block URL must be a valid http(s) URL' }, { status: 400 });
    }

    const block = await prisma.bioBlock.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!block) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }

    if (block.profile.userId) {
      if (block.profile.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    } else if (block.profile.workspaceId) {
      const access = await requireWorkspaceRole(request, block.profile.workspaceId, EDIT_ROLES);
      if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated = await prisma.bioBlock.update({
      where: { id },
      data: {
        title: json.title ?? undefined,
        url: json.url ?? undefined,
        content: json.content ?? undefined,
        metadataJson: json.metadataJson ?? undefined,
        position: json.position ?? undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating block:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const block = await prisma.bioBlock.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!block) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }

    if (block.profile.userId) {
      if (block.profile.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    } else if (block.profile.workspaceId) {
      const access = await requireWorkspaceRole(request, block.profile.workspaceId, EDIT_ROLES);
      if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.bioBlock.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting block:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
