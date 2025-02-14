'use client'

import { useState } from 'react';
import { generateTests } from '@/lib/api';

interface UrlFormData {
    url: string; 
    username?: string; 
    password?: string; 
    requiresAuth: boolean;
}


export default function UrlInputForm() {
    const [formData, setFormData] = useState<UrlFormData>({ //formData: current state; setFormData: function to update state 
        url: '',
        username: '',
        password: '',
        requiresAuth: false,
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<any | null>(null);

    //Handle form submission 
    const handleSubmit = async (e:React.FormEvent) => {
        e.preventDefault();
        setLoading(true); 
        setError(null); 
        try {
            const response = await generateTests(formData);
            setResult(response);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred');
        }
        finally {
            setLoading(false);
        }
    };

    //Render the form 
    return (
        <div className="max-w-md mx-auto mt-8">
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* URL Input */}
                <div>
                    <label htmlFor="url" className="block text-sm font-medium mb-1">
                        Website URL
                    </label>
                    <input 
                        type="url"
                        id="url"
                        required 
                        className="w-full p-2 border rounded-md"
                        value={formData.url}
                        onChange={(e) => setFormData({...formData, url: e.target.value})}
                        placeholder="https://www.example.com"
                    />
                </div>

                {/* Authentication Checkbox */}
                <div>
                    <label className="flex items-center">
                        <input 
                            type="checkbox"
                            checked={formData.requiresAuth}
                            onChange={(e) => setFormData({...formData, requiresAuth: e.target.checked})}
                            className="mr-2"
                        />
                        <span className="text-sm">Requires Authentication</span>
                    </label>
                </div>

                {/* Conditional Authentication Fields */}
                {formData.requiresAuth && (
                    <> 
                    {/* Username Input */}
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium mb-1">Username</label>
                        <input id="username" type="text" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full p-2 border rounded-md" />
                    </div>
                    {/* Password Input */}
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
                        <input id="password" type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full p-2 border rounded-md"/>
                    </div>
                    </>
                )}
                <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded-md">Generate Test Cases</button>
            </form> 
        </div>
    );
}