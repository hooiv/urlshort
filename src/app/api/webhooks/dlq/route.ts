import { NextResponse } from 'next/server';
import { processDeadLetterQueue } from '@/lib/webhooks';

// This endpoint could be called by a cron service like Vercel Cron or GitHub Actions
export async function POST(request: Request) {
  try {
    // Ideally require a cron secret here
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = await processDeadLetterQueue();
    
    return NextResponse.json(results);
  } catch (error) {
    console.error('DLQ processing error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
