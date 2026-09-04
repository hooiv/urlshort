import {NextRequest,NextResponse} from 'next/server'
import {getCurrentUser} from '@/lib/auth'
import {rateLimit} from '@/lib/rate-limit'
import {summarizeServerMetrics,errorBudgetStatus} from '@/lib/observability'
import {evaluateReliability} from '@/lib/reliability-alerts'
export async function GET(request:NextRequest){const limit=await rateLimit(request,{name:'status-alerts',limit:60,windowMs:60_000});if(!limit.allowed)return NextResponse.json({error:'Rate limit exceeded'},{status:429});const user=await getCurrentUser(request);if(!user)return NextResponse.json({error:'Authentication required'},{status:401});const summary=summarizeServerMetrics();return NextResponse.json({summary,errorBudget:errorBudgetStatus(summary),alerts:evaluateReliability(summary)},{headers:{'Cache-Control':'private, max-age=5'}})}
