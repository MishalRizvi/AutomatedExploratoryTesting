import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8000',
    headers: {
        'Content-Type': 'application/json',
    },
});

export const generateTests = async (formData: {
    url: string; 
    username?: string; 
    password?: string; 
    requiresAuth?: boolean; 
}) => {
    try {
        const response = await api.post('/api/generate-tests', formData);
        return response.data;
    } 
    catch (error) {
        console.error('Error generating tests:', error);
        throw error;
    }
};


export default api; 