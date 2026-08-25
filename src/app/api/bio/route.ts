import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';


export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

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

    const json = await request.json();
    const { handle, displayName, bioText, theme, workspaceId } = json;

    if (!handle) {
      return NextResponse.json({ error: 'Handle is required' }, { status: 400 });
    }

    const existing = await prisma.bioProfile.findUnique({
      where: { handle },
    });

    if (existing) {
      return NextResponse.json({ error: 'Handle already taken' }, { status: 409 });
    }

    const profile = await prisma.bioProfile.create({
      data: {
        handle,
        displayName,
        bioText,
        theme: theme || 'light',
        ...(workspaceId ? { workspaceId } : { userId: user.id }),
      },
    });

    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    console.error('Error creating bio profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
