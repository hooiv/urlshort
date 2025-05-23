export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-pink-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-red-600 mb-4">404</h1>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Link Not Found</h2>
        <p className="text-lg text-gray-600 mb-8">
          The short link you're looking for doesn't exist or has been removed.
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
