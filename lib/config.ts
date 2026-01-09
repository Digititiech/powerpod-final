// Configuration for API endpoints

const getApiBaseUrl = () => {
  return import.meta.env.VITE_API_URL || 'http://185.203.118.30:3001/api';
};

export const API_BASE_URL = getApiBaseUrl();
export const API_KEY = import.meta.env.VITE_API_KEY || 'pp_live_78234_secure_key';
