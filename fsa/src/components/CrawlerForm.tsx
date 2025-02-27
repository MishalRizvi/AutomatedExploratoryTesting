import React, { useState } from 'react';

interface CrawlerFormProps {
    onSubmit: (url: string) => void;
}

const CrawlerForm: React.FC<CrawlerFormProps> = ({ onSubmit }) => {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await onSubmit(url);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-6">Flow State Analyzer</h2>
            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label 
                        htmlFor="url" 
                        className="block text-gray-700 text-sm font-bold mb-2"
                    >
                        Enter URL to analyze
                    </label>
                    <input
                        type="url"
                        id="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com"
                        required
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors
                        ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {isLoading ? 'Analyzing...' : 'Start Analysis'}
                </button>
            </form>
        </div>
    );
};

export default CrawlerForm;