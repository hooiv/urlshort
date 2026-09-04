import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { requireWorkspaceRole, EDIT_ROLES } from '@/lib/workspaces';
import { rateLimit } from '@/lib/rate-limit';

const BIO_HANDLE_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

export function normalizeRouteHandle(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export const bioUpdateSchema = z.object({
  displayName: z.string().trim().max(80).nullish(),
  bioText: z.string().trim().max(500).nullish(),
  theme: z.string().trim().max(32).nullish(),
  avatarUrl: z.string().trim().max(2048).nullish(),
});

function isSafeAvatarUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const limit = await rateLimit(request, { name: 'bio-profile-get', limit: 120, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    const { handle: rawHandle } = await params;
    const handle = normalizeRouteHandle(rawHandle);
    if (!BIO_HANDLE_RE.test(handle)) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    const profile = await prisma.bioProfile.findUnique({
      where: { handle },
      include: {
        blocks: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = await rateLimit(request, { name: 'bio-profile-update', limit: 60, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { handle: rawHandle } = await params;
    const handle = normalizeRouteHandle(rawHandle);
    if (!BIO_HANDLE_RE.test(handle)) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    const parsed = bioUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid profile data' }, { status: 400 });
    const json = parsed.data;
    if (json.avatarUrl && !isSafeAvatarUrl(json.avatarUrl)) {
      return NextResponse.json({ error: 'avatarUrl must be an https URL' }, { status: 400 });
    }

    const profile = await prisma.bioProfile.findUnique({
      where: { handle },
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

    const updated = await prisma.bioProfile.update({
      where: { handle },
      data: {
        displayName: json.displayName ?? undefined,
        bioText: json.bioText ?? undefined,
        theme: json.theme ?? undefined,
        avatarUrl: json.avatarUrl ?? undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
