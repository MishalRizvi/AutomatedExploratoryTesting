'use client'

import { useState } from 'react';
import { generateTests } from '@/lib/api';

export default function UrlInputForm() {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [testFlows, setTestFlows] = useState<string[][]>([]);

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setTestFlows([]);
        
        try {
            // Generate tests and get the results directly
            const response = await generateTests({ url });
            
            if (response && response.flows) {
                setTestFlows(response.flows);
            } else {
                setError('No test flows were generated');
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : 'An unknown error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto mt-8">
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Generate Test Cases</h2>
                
                {/* URL Input */}
                <div className="mb-6">
                    <label htmlFor="url" className="block text-sm font-medium text-gray-900 mb-2">
                        Website URL
                    </label>
                    <input 
                        type="url"
                        id="url"
                        required 
                        className="w-full p-3 border border-gray-300 rounded-md text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://www.example.com"
                        disabled={loading}
                    />
                    <p className="mt-1 text-sm text-gray-600">Enter the URL of the website you want to test</p>
                </div>

                {/* Submit Button */}
                <button 
                    type="submit" 
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading || !url}
                >
                    {loading ? 'Generating...' : 'Generate Test Cases'}
                </button>
            </form>
            
            {/* Display the loading state */}
            {loading && (
                <div className="mt-8 p-6 bg-white rounded-lg shadow-md border border-gray-200">
                    <div className="flex flex-col items-center">
                        <div className="w-16 h-16 border-t-4 border-b-4 border-indigo-600 rounded-full animate-spin"></div>
                        <p className="mt-4 text-gray-900 font-medium">Analyzing website and generating tests...</p>
                        <p className="mt-2 text-gray-700">This may take a minute or two</p>
                    </div>
                </div>
            )}
            
            {/* Display the error */}
            {error && (
                <div className="mt-8 p-6 bg-red-50 border border-red-200 rounded-lg shadow-md">
                    <h3 className="text-lg font-semibold text-red-700 mb-2">Error</h3>
                    <p className="text-red-600">{error}</p>
                </div>
            )}

            {/* Display the test flows */}
            {testFlows.length > 0 && (
                <div className="mt-8">
                    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4 pb-2 border-b">Generated Test Flows</h2>
                        
                        <div className="space-y-4">
                            {testFlows.map((flow, index) => (
                                <div key={index} className="bg-gray-50 p-4 rounded-md">
                                    <h3 className="font-medium text-indigo-700 mb-2">Flow #{index + 1}</h3>
                                    <ol className="list-decimal list-inside space-y-2 text-gray-900">
                                        {flow.map((step, stepIndex) => (
                                            <li key={stepIndex} className="pl-2">{step}</li>
                                        ))}
                                    </ol>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}