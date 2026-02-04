import { Repository } from '../types';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface SearchResultsProps {
  results: Repository[];
  total: number;
  loading: boolean;
  error?: string;
  onLoadMore?: () => void;
}

export default function SearchResults({
  results,
  total,
  loading,
  error,
  onLoadMore,
}: SearchResultsProps) {
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const copyToClipboard = (url: string, id: number) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        <p className="font-semibold">Error</p>
        <p>{error}</p>
      </div>
    );
  }

  if (!loading && results.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">No repositories found</p>
        <p className="text-gray-400">Try adjusting your search filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Results Header */}
      {results.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            Showing {results.length} of {total} repositories
          </p>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Repository
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Category
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                Status
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                URL
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {results.map((repo) => (
              <tr key={repo.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{repo.name}</p>
                    <p className="text-sm text-gray-600 truncate">
                      {repo.title}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {repo.category || 'other'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {repo.cloned && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800">
                        Cloned
                      </span>
                    )}
                    {repo.deployed && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                        Deployed
                      </span>
                    )}
                    {!repo.cloned && !repo.deployed && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-800">
                        New
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span className="text-sm truncate">
                        {repo.url.replace('https://github.com/', '')}
                      </span>
                    </a>
                    <button
                      onClick={() => copyToClipboard(repo.url, repo.id)}
                      className="text-gray-400 hover:text-gray-600 transition"
                      title="Copy URL"
                    >
                      {copiedId === repo.id ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Load More Button */}
      {results.length < total && onLoadMore && (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:bg-gray-200 transition"
        >
          {loading ? 'Loading...' : `Load More (${results.length}/${total})`}
        </button>
      )}

      {/* Loading State */}
      {loading && results.length === 0 && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 border-t-blue-600"></div>
        </div>
      )}
    </div>
  );
}
