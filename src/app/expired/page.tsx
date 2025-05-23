export default function Expired() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-yellow-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-orange-600 mb-4">⏰</h1>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Link Expired</h2>
        <p className="text-lg text-gray-600 mb-8">
          This short link has expired and is no longer accessible.
        </p>
        <a
          href="/"
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create New Link
        </a>
      </div>
    </div>
  )
}
