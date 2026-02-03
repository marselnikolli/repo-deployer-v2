import React, { useRef } from 'react'
import { importApi } from '../api/client'
import toast from 'react-hot-toast'

export const ImportBookmarks: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = React.useState(false)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setLoading(true)
      const response = await importApi.htmlFile(file)
      toast.success(`Found ${response.data.total_found} repositories!`)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Upload failed')
    } finally {
      setLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Import Bookmarks</h2>
      
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
        onClick={() => fileInputRef.current?.click()}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".html"
          onChange={handleFileUpload}
          className="hidden"
          disabled={loading}
        />
        
        <div className="text-4xl mb-2">📄</div>
        <p className="text-gray-700 font-semibold">
          {loading ? 'Uploading...' : 'Click to upload HTML bookmark file'}
        </p>
        <p className="text-sm text-gray-500 mt-1">or drag and drop</p>
      </div>

      <div className="mt-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
        <h3 className="font-semibold text-blue-900 mb-2">How to export bookmarks:</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li><strong>Chrome:</strong> Menu → Bookmarks → Bookmark manager → Export bookmarks</li>
          <li><strong>Firefox:</strong> Menu → Bookmarks → Manage bookmarks → Import and Backup → Export Bookmarks</li>
        </ul>
      </div>
    </div>
  )
}
