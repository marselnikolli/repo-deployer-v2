import { useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchFilters {
  q?: string;
  category?: string;
  cloned?: boolean;
  deployed?: boolean;
}

interface SearchBarProps {
  onSearch: (filters: SearchFilters) => void;
  loading?: boolean;
}

export default function SearchBar({ onSearch, loading = false }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    cloned: false,
    deployed: false,
  });
  const [category, setCategory] = useState('');

  const handleSearch = () => {
    onSearch({
      q: query,
      category: category || undefined,
      cloned: filters.cloned || undefined,
      deployed: filters.deployed || undefined,
    });
  };

  const handleClear = () => {
    setQuery('');
    setCategory('');
    setFilters({ cloned: false, deployed: false });
    onSearch({});
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const hasFilters = query || category || filters.cloned || filters.deployed;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="space-y-4">
        {/* Search Input */}
        <div className="relative">
          <div className="flex items-center">
            <Search className="w-5 h-5 text-gray-400 absolute left-3" />
            <input
              type="text"
              placeholder="Search repositories by name, title, or URL..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Category Filter */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          >
            <option value="">All Categories</option>
            <option value="web">Web Development</option>
            <option value="mobile">Mobile</option>
            <option value="backend">Backend</option>
            <option value="devops">DevOps</option>
            <option value="ci_cd">CI/CD</option>
            <option value="database">Database</option>
            <option value="ml">Machine Learning</option>
            <option value="other">Other</option>
          </select>

          {/* Checkboxes */}
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.cloned}
                onChange={(e) =>
                  setFilters({ ...filters, cloned: e.target.checked })
                }
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <span className="text-sm text-gray-700">Cloned</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.deployed}
                onChange={(e) =>
                  setFilters({ ...filters, deployed: e.target.checked })
                }
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <span className="text-sm text-gray-700">Deployed</span>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>

            {hasFilters && (
              <button
                onClick={handleClear}
                disabled={loading}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 disabled:bg-gray-400 transition"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
