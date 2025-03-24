import React from 'react';

interface ProgressProps {
    progress: {
        status: string;
        message: string;
        graph?: any;
        visitedUrls?: string[];
        interactiveElements?: number;
        completedSteps?: number;
        totalSteps?: number;
    };
}

export default function TestGenerationProgress({ progress }: ProgressProps) {
    // Calculate progress percentage
    const progressPercentage = progress.completedSteps && progress.totalSteps
        ? Math.round((progress.completedSteps / progress.totalSteps) * 100)
        : 0;
    
    return (
        <div className="mt-8 p-6 bg-white rounded-lg shadow-md border border-gray-200 animate-fadeIn">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b flex items-center">
                <svg className="w-5 h-5 text-indigo-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Test Generation Progress
            </h3>
            
            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                <div 
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2.5 rounded-full transition-all duration-500 ease-in-out" 
                    style={{ width: `${progressPercentage}%` }}
                ></div>
            </div>
            
            {/* Status message */}
            <div className="mb-4">
                <p className="text-gray-800 font-medium">{progress.message}</p>
                {progress.completedSteps !== undefined && progress.totalSteps !== undefined && (
                    <p className="text-gray-600 text-sm mt-1">
                        Step {progress.completedSteps} of {progress.totalSteps} ({progressPercentage}% complete)
                    </p>
                )}
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                {progress.visitedUrls && (
                    <div className="bg-indigo-50 p-3 rounded-md">
                        <h4 className="text-sm font-semibold text-indigo-700 mb-1">Pages Visited</h4>
                        <p className="text-2xl font-bold text-indigo-800">{progress.visitedUrls.length}</p>
                    </div>
                )}
                
                {progress.interactiveElements !== undefined && (
                    <div className="bg-purple-50 p-3 rounded-md">
                        <h4 className="text-sm font-semibold text-purple-700 mb-1">Interactive Elements</h4>
                        <p className="text-2xl font-bold text-purple-800">{progress.interactiveElements}</p>
                    </div>
                )}
            </div>
            
            {/* Recent activity */}
            {progress.visitedUrls && progress.visitedUrls.length > 0 && (
                <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Recently Visited Pages</h4>
                    <div className="bg-gray-50 p-3 rounded-md max-h-32 overflow-y-auto">
                        <ul className="text-sm text-gray-600 space-y-1">
                            {progress.visitedUrls.slice(-5).map((url, index) => (
                                <li key={index} className="truncate">
                                    <span className="inline-block w-4 h-4 bg-green-100 text-green-800 rounded-full text-xs font-medium text-center mr-2">
                                        {index + 1}
                                    </span>
                                    {url}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
            
            {/* Graph visualization (simplified) */}
            {progress.graph && (
                <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Website Structure</h4>
                    <div className="bg-gray-50 p-3 rounded-md overflow-hidden">
                        <div className="text-xs text-gray-600 font-mono overflow-x-auto max-h-40">
                            <pre>{JSON.stringify(progress.graph, null, 2)}</pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 