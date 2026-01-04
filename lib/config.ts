// Configuration for API endpoints

const getApiBaseUrl = () => {
  return import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
};

export const API_BASE_URL = getApiBaseUrl();
