import {NextResponse} from 'next/server'
import {summarizeServerMetrics,errorBudgetStatus} from '@/lib/observability'
import {evaluateReliability} from '@/lib/reliability-alerts'
export async function GET(){const summary=summarizeServerMetrics();return NextResponse.json({summary,errorBudget:errorBudgetStatus(summary),alerts:evaluateReliability(summary)},{headers:{'Cache-Control':'no-store'}})}
