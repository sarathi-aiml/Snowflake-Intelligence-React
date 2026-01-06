// API utility functions for Next.js
// In Next.js, API routes are on the same origin, so we can use relative paths

// Get auth token from localStorage
export const getAuthToken = () => {
  if (typeof window === 'undefined') return null; // SSR safety
  return localStorage.getItem('authToken');
};

// Set auth token in localStorage
export const setAuthToken = (token) => {
  if (typeof window === 'undefined') return; // SSR safety
  localStorage.setItem('authToken', token);
  // Dispatch custom event to notify components that token was set
  window.dispatchEvent(new Event('authTokenSet'));
};

// Remove auth token from localStorage
export const removeAuthToken = () => {
  if (typeof window === 'undefined') return; // SSR safety
  localStorage.removeItem('authToken');
};

// Make authenticated API call
export const apiCall = async (endpoint, options = {}) => {
  const token = getAuthToken();
  // In Next.js, API routes are on same origin, use relative path
  // Ensure endpoint always starts with /api if it's an API route
  let url;
  if (endpoint.startsWith('/api/')) {
    // Already has /api prefix, use as-is
    url = endpoint;
  } else if (endpoint.startsWith('/')) {
    // Starts with / but missing /api, add it
    url = `/api${endpoint}`;
  } else {
    // No leading slash, add /api/
    url = `/api/${endpoint}`;
  }

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    removeAuthToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return null;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
    const errorMessage = error.error || error.message || `HTTP ${response.status}: ${response.statusText}`;
    console.error(`[apiCall] Error ${response.status} for ${url}:`, errorMessage, error);
    throw new Error(errorMessage);
  }

  return await response.json();
};

// Handle API error
export const handleApiError = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));

    if (response.status === 401) {
      removeAuthToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return;
    }

    if (response.status === 403) {
      throw new Error('Access denied. Admin privileges required.');
    }

    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return await response.json();
};

