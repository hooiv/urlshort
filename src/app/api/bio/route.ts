import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { requireWorkspaceRole, EDIT_ROLES } from '@/lib/workspaces';
import { rateLimit } from '@/lib/rate-limit';

export const MAX_BIO_HANDLE_LENGTH = 64;
const BIO_HANDLE_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

export function normalizeBioHandle(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function validateBioHandle(raw: unknown): string | null {
  const handle = normalizeBioHandle(raw);
  if (!handle) return 'Handle is required';
  if (handle.length > MAX_BIO_HANDLE_LENGTH) return `Handle must be ${MAX_BIO_HANDLE_LENGTH} characters or fewer`;
  if (!BIO_HANDLE_RE.test(handle)) return 'Handle may only contain lowercase letters, numbers, and hyphens, and must start and end with a letter or number';
  return null;
}

export const bioCreateSchema = z.object({
  handle: z.string().trim().toLowerCase().min(1).max(MAX_BIO_HANDLE_LENGTH).regex(BIO_HANDLE_RE, 'Invalid handle'),
  displayName: z.string().trim().max(80).nullish(),
  bioText: z.string().trim().max(500).nullish(),
  theme: z.string().trim().max(32).optional(),
  workspaceId: z.string().cuid().nullish(),
});


export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (workspaceId) {
      const access = await requireWorkspaceRole(request, workspaceId, EDIT_ROLES);
      if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const profiles = await prisma.bioProfile.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : { userId: user.id }),
      },
      include: {
        blocks: {
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json(profiles);
  } catch (error) {
    console.error('Error fetching bio profiles:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = await rateLimit(request, { name: 'bio-create', limit: 20, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const raw = await request.json().catch(() => null);
    const parsed = bioCreateSchema.safeParse(raw);
    if (!parsed.success) {
      const handleError = validateBioHandle((raw as { handle?: unknown } | null)?.handle ?? null);
      return NextResponse.json({ error: handleError ?? 'Invalid bio profile' }, { status: 400 });
    }
    const { handle, displayName, bioText, theme, workspaceId } = parsed.data;

    const existing = await prisma.bioProfile.findUnique({
      where: { handle },
    });

    if (existing) {
      return NextResponse.json({ error: 'Handle already taken' }, { status: 409 });
    }

    if (workspaceId) {
      const access = await requireWorkspaceRole(request, workspaceId, EDIT_ROLES);
      if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    }

    let profile;
    try {
      profile = await prisma.bioProfile.create({
        data: {
          handle,
          displayName: displayName?.slice(0, 80) || null,
          bioText: bioText?.slice(0, 500) || null,
          theme: theme?.slice(0, 32) || 'light',
          ...(workspaceId ? { workspaceId } : { userId: user.id }),
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return NextResponse.json({ error: 'Handle already taken' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    console.error('Error creating bio profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
