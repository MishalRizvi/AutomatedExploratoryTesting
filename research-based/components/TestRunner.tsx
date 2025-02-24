'use client';

import { useState } from 'react';
import { WebPageModel } from '@/lib/testing/types';
import { publicPageModel } from '@/lib/testing/publicPageModel';

interface TestResult {
  path: string[];
  success: boolean;
  timestamp: string;
}

export default function TestRunner() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');

  const testApi = async () => {
    try {
      console.log('Testing API connection...');
      const response = await fetch('/api/hello');
      const data = await response.json();
      console.log('API test response:', data);
    } catch (error) {
      console.error('API test failed:', error);
    }
  };

  const runTests = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) {
      setError('Please enter a URL to test');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log('Starting test run for URL:', url);
      const response = await fetch('/api/test-runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          models: [publicPageModel],
          baseUrl: url
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Test results:', data);
      setResults(data.results);
    } catch (error) {
      console.error('Test execution error:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg shadow-lg">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Web Application Test Runner</h1>
        
        <button
          onClick={testApi}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Test API
        </button>
      </div>

      <form onSubmit={runTests} className="space-y-4">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700">
            Website URL to Test
          </label>
          <div className="mt-1 flex rounded-md shadow-sm">
            <input
              type="url"
              name="url"
              id="url"
              className="flex-1 min-w-0 block w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`
            w-full px-6 py-3 rounded-md text-white font-semibold
            ${loading 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700'}
            transition-colors duration-200
          `}
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Running Tests...
            </span>
          ) : (
            'Run Tests'
          )}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Test Results</h2>
          <div className="space-y-3">
            {results.map((result, index) => (
              <div 
                key={index}
                className={`p-4 rounded-lg border ${
                  result.success 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-2 ${
                    result.success ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <p className="font-medium text-gray-900">
                    Test Path {index + 1}
                  </p>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Path: {result.path.join(' → ')}
                </p>
                <p className="text-sm text-gray-600">
                  Status: {result.success ? 'Passed' : 'Failed'}
                </p>
                <p className="text-sm text-gray-500">
                  {new Date(result.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}