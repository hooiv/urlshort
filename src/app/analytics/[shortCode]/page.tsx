'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { BarChart3, Eye, Calendar, Globe, ExternalLink, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface AnalyticsData {
  url: {
    id: string
    originalUrl: string
    shortCode: string
    title?: string
    clicks: number
    createdAt: string
  }
  analytics: {
    totalClicks: number
    clicksByDate: Record<string, number>
    clicksByCountry: Record<string, number>
    clicksByReferrer: Record<string, number>
    recentClicks: Array<{
      createdAt: string
      country?: string
      referrer: string
    }>
  }
}

export default function Analytics() {
  const params = useParams()
  const shortCode = params.shortCode as string
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await fetch(`/api/analytics/${shortCode}`)
        if (!response.ok) {
          throw new Error('Failed to fetch analytics')
        }
        const analyticsData = await response.json()
        setData(analyticsData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    if (shortCode) {
      fetchAnalytics()
    }
  }, [shortCode])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600 mb-4">{error || 'Analytics data not found'}</p>
          <Link href="/" className="text-blue-600 hover:text-blue-800">
            ← Back to Home
          </Link>
        </div>
      </div>
    )
  }

  const { url, analytics } = data

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-600 hover:text-blue-600 transition-colors">
                <ArrowLeft className="w-6 h-6" />
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* URL Info */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {url.title || 'Untitled'}
              </h2>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Short URL:</span>
                  <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                    {`${window.location.origin}/${url.shortCode}`}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Original URL:</span>
                  <a 
                    href={url.originalUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    {url.originalUrl}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Created:</span>
                  <span className="text-sm text-gray-700">
                    {new Date(url.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Eye className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Clicks</p>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalClicks}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Globe className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Countries</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.keys(analytics.clicksByCountry).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <BarChart3 className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Referrers</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.keys(analytics.clicksByReferrer).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Calendar className="w-6 h-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Days Active</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.keys(analytics.clicksByDate).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Clicks by Country */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Clicks by Country</h3>
            <div className="space-y-3">
              {Object.entries(analytics.clicksByCountry)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 10)
                .map(([country, clicks]) => (
                  <div key={country} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{country}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ 
                            width: `${(clicks / analytics.totalClicks) * 100}%` 
                          }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900 w-8">{clicks}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Clicks by Referrer */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Referrers</h3>
            <div className="space-y-3">
              {Object.entries(analytics.clicksByReferrer)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 10)
                .map(([referrer, clicks]) => (
                  <div key={referrer} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 truncate">{referrer}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full" 
                          style={{ 
                            width: `${(clicks / analytics.totalClicks) * 100}%` 
                          }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900 w-8">{clicks}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Clicks by Date */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Clicks Over Time</h3>
            <div className="space-y-3">
              {Object.entries(analytics.clicksByDate)
                .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                .slice(0, 10)
                .map(([date, clicks]) => (
                  <div key={date} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">
                      {new Date(date).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-purple-600 h-2 rounded-full" 
                          style={{ 
                            width: `${(clicks / Math.max(...Object.values(analytics.clicksByDate))) * 100}%` 
                          }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900 w-8">{clicks}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Recent Clicks */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Clicks</h3>
            <div className="space-y-3">
              {analytics.recentClicks.map((click, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                  <div>
                    <p className="text-sm text-gray-700">{click.referrer}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(click.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-sm text-gray-600">{click.country || 'Unknown'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
