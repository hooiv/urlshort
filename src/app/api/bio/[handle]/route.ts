import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { requireWorkspaceRole, EDIT_ROLES } from '@/lib/workspaces';


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
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

    const { handle } = await params;
    const json = await request.json();

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
        displayName: json.displayName,
        bioText: json.bioText,
        theme: json.theme,
        avatarUrl: json.avatarUrl,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
