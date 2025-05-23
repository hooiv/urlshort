'use client'

import { useState } from 'react'
import { Link, Copy, BarChart3, Zap, Shield, Globe } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

interface ShortenedUrl {
  id: string
  originalUrl: string
  shortCode: string
  shortUrl: string
  title?: string
  clicks: number
  createdAt: string
}

export default function Home() {
  const [url, setUrl] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [shortenedUrl, setShortenedUrl] = useState<ShortenedUrl | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!url.trim()) {
      toast.error('Please enter a URL')
      return
    }

    setIsLoading(true)
    
    try {
      const response = await fetch('/api/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url: url.trim(),
          customCode: customCode.trim() || undefined
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to shorten URL')
      }

      setShortenedUrl(data)
      toast.success('URL shortened successfully!')
      setUrl('')
      setCustomCode('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard!')
    } catch (error) {
      toast.error('Failed to copy')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Link className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">QuickLink</h1>
            </div>
            <nav className="hidden md:flex space-x-8">
              <a href="#features" className="text-gray-600 hover:text-blue-600 transition-colors">Features</a>
              <a href="#analytics" className="text-gray-600 hover:text-blue-600 transition-colors">Analytics</a>
              <a href="#pricing" className="text-gray-600 hover:text-blue-600 transition-colors">Pricing</a>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            Shorten Your URLs
            <span className="text-blue-600"> Instantly</span>
          </h2>
          <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto">
            Transform long, complex URLs into short, memorable links. Track clicks, analyze traffic, and manage your links with powerful analytics.
          </p>

          {/* URL Shortener Form */}
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 border">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Enter your long URL here..."
                    className="w-full px-6 py-4 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    disabled={isLoading}
                  />
                </div>
                <div className="lg:w-48">
                  <input
                    type="text"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value)}
                    placeholder="Custom code (optional)"
                    className="w-full px-6 py-4 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    disabled={isLoading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <Zap className="w-5 h-5 mr-2" />
                      Shorten
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Result */}
            {shortenedUrl && (
              <div className="mt-8 bg-green-50 border border-green-200 rounded-2xl p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-green-600 font-medium mb-2">Your shortened URL:</p>
                    <div className="flex items-center gap-3">
                      <a 
                        href={shortenedUrl.shortUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xl font-mono text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        {shortenedUrl.shortUrl}
                      </a>
                      <button
                        onClick={() => copyToClipboard(shortenedUrl.shortUrl)}
                        className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                    </div>
                    {shortenedUrl.title && (
                      <p className="text-sm text-gray-600 mt-2">📄 {shortenedUrl.title}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Features Section */}
        <section id="features" className="py-16">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-gray-900 mb-4">Powerful Features</h3>
            <p className="text-lg text-gray-600">Everything you need to manage and track your links</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-xl p-8 shadow-lg border hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-4">Advanced Analytics</h4>
              <p className="text-gray-600">
                Track clicks, analyze traffic sources, and understand your audience with detailed analytics and insights.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-lg border hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-6">
                <Shield className="w-6 h-6 text-green-600" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-4">Secure & Reliable</h4>
              <p className="text-gray-600">
                Your links are protected with enterprise-grade security and 99.9% uptime guarantee.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-lg border hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-6">
                <Globe className="w-6 h-6 text-purple-600" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-4">Global CDN</h4>
              <p className="text-gray-600">
                Lightning-fast redirects powered by our global content delivery network across 6 continents.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Link className="h-8 w-8" />
              <span className="text-2xl font-bold">QuickLink</span>
            </div>
            <p className="text-gray-400">
              © 2025 QuickLink. Built with Next.js, TypeScript, and Tailwind CSS.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
