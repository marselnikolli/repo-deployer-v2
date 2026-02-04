import { useState, useEffect } from 'react';
import SearchBar from '../components/SearchBar';
import SearchResults from '../components/SearchResults';
import { api } from '../services/api';
import { Repository } from '../types';

export default function SearchPage() {
  const [results, setResults] = useState<Repository[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [offset, setOffset] = useState(0);
  const [currentFilters, setCurrentFilters] = useState<any>({});

  const handleSearch = async (filters: any) => {
    try {
      setLoading(true);
      setError(undefined);
      setOffset(0);
      setCurrentFilters(filters);

      const response = await api.search(
        filters.q,
        filters.category,
        filters.cloned,
        filters.deployed,
        100,
        0
      );

      setResults(response.results);
      setTotal(response.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to search repositories'
      );
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    try {
      setLoading(true);
      const newOffset = offset + 100;

      const response = await api.search(
        currentFilters.q,
        currentFilters.category,
        currentFilters.cloned,
        currentFilters.deployed,
        100,
        newOffset
      );

      setResults([...results, ...response.results]);
      setOffset(newOffset);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load more results'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Search Repositories</h1>
          <p className="text-gray-600">
            Find and explore repositories from the database
          </p>
        </div>

        {/* Search Bar */}
        <SearchBar onSearch={handleSearch} loading={loading} />

        {/* Results */}
        <SearchResults
          results={results}
          total={total}
          loading={loading}
          error={error}
          onLoadMore={handleLoadMore}
        />
      </div>
    </div>
  );
}
