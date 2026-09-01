import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { summarizeServerMetrics, errorBudgetStatus } from '@/lib/observability'
export async function GET(request:NextRequest){const user=await getCurrentUser(request);if(!user)return NextResponse.json({error:'Authentication required'},{status:401});const summary=summarizeServerMetrics();return NextResponse.json({summary,errorBudget:errorBudgetStatus(summary),generatedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, max-age=5'}})}