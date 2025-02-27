'use client';
import { useState } from 'react';

interface PageNode {
    url: string;
    title: string;
    links: string[];
    buttons: string[];
    forms: string[];
    children?: PageNode[];
}

function TreeNode({ node }: { node: PageNode }) {
    const [isExpanded, setIsExpanded] = useState(true);
    const hasChildren = node.children && node.children.length > 0;

    return (
        <div className="ml-4">
            <div className="flex items-center gap-2 p-2">
                {hasChildren && (
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-4 text-gray-500"
                    >
                        {isExpanded ? '▼' : '▶'}
                    </button>
                )}
                <div className="flex flex-col">
                    <span className="font-medium">{node.title || 'Untitled'}</span>
                    <span className="text-sm text-gray-500">{node.url}</span>
                    <div className="text-sm space-x-2">
                        {node.buttons?.length > 0 && (
                            <span className="text-blue-500">🔘 {node.buttons.length} buttons</span>
                        )}
                        {node.forms?.length > 0 && (
                            <span className="text-green-500">📝 {node.forms.length} forms</span>
                        )}
                        {node.links?.length > 0 && (
                            <span className="text-purple-500">🔗 {node.links.length} links</span>
                        )}
                    </div>
                </div>
            </div>
            {isExpanded && hasChildren && (
                <div className="border-l-2 border-gray-200">
                    {node.children?.map((child, index) => (
                        <TreeNode key={index} node={child} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function Home() {
    const [url, setUrl] = useState('');
    const [tree, setTree] = useState<PageNode | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await fetch('/api/crawl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await response.json();
            setTree(data);
            console.log(data);
        } catch (error) {
            console.error('Crawling failed:', error);
        }
        setLoading(false);
    };

    return (
        <main className="p-8">
            <form onSubmit={handleSubmit} className="mb-8">
                <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Enter URL to crawl"
                    className="p-2 border rounded mr-2"
                    required
                />
                <button 
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                    {loading ? 'Crawling...' : 'Crawl'}
                </button>
            </form>

            {tree && <TreeNode node={tree} />}
        </main>
    );
}