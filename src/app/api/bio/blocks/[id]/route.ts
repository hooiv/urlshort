import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';


export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const json = await request.json();

    const block = await prisma.bioBlock.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!block) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }

    if (block.profile.userId && block.profile.userId !== user.id) {
       return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated = await prisma.bioBlock.update({
      where: { id },
      data: {
        title: json.title,
        url: json.url,
        content: json.content,
        metadataJson: json.metadataJson,
        position: json.position, // for reordering
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

    if (block.profile.userId && block.profile.userId !== user.id) {
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
