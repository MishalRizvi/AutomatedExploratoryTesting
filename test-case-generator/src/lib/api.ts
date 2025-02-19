import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
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
        const response = await api.post('/generate-tests', formData);
        return response.data;
    } 
    catch (error) {
        console.error('Error generating tests:', error);
        throw error;
    }
};


export default api; 