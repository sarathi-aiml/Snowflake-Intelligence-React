'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiCall, getAuthToken, removeAuthToken } from '@/utils/api';

// Demo user object
const DEMO_USER = {
  id: 'demo-user-id',
  email: 'demo@example.com',
  name: 'Demo User',
  role: 'USER',
  picture: null,
  isDemo: true
};

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [demoModeEnabled, setDemoModeEnabled] = useState(null);

  // Check if demo mode is enabled from API or localStorage
  const checkDemoMode = useCallback(async () => {
    if (typeof window === 'undefined') return false;
    
    // Get cached value for comparison
    const cachedDemoMode = localStorage.getItem('demoMode');
    const wasDemo = cachedDemoMode === 'true';
    
    // Always check API endpoint first to get current demo mode status from server
    try {
      const response = await fetch('/api/demo/check');
      const data = await response.json();
      const isDemo = data.demo === true;
      
      // Detect mode switch: if mode changed from demo to non-demo, clear demo data
      if (wasDemo && !isDemo) {
        console.log('[Auth] Demo mode disabled - clearing demo data');
        // Clear demo-related localStorage data
        localStorage.removeItem('demoMode');
        localStorage.removeItem('demo_conversations');
        // Clear user state if it was demo user
        setUser(prev => {
          if (prev?.isDemo) {
            return null;
          }
          return prev;
        });
      } else if (!wasDemo && isDemo) {
        console.log('[Auth] Demo mode enabled - clearing auth token');
        // If switching to demo mode, clear auth token
        removeAuthToken();
        setUser(null);
      }
      
      // Update cache with server value
      localStorage.setItem('demoMode', isDemo ? 'true' : 'false');
      setDemoModeEnabled(isDemo);
      return isDemo;
    } catch (error) {
      console.error('Failed to check demo mode:', error);
      // Fallback: use cached value if API fails
      if (cachedDemoMode === 'true') {
        setDemoModeEnabled(true);
        return true;
      }
      if (cachedDemoMode === 'false') {
        setDemoModeEnabled(false);
        return false;
      }
      // Fallback: check environment variable if cache and API both fail
      if (process.env.NEXT_PUBLIC_DEMO === 'true') {
        localStorage.setItem('demoMode', 'true');
        setDemoModeEnabled(true);
        return true;
      }
      setDemoModeEnabled(false);
      return false;
    }
  }, []);

  const isDemoMode = useCallback(() => {
    // Return cached value if available
    if (demoModeEnabled !== null) {
      return demoModeEnabled;
    }
    // Fallback to localStorage check
    if (typeof window !== 'undefined') {
      return localStorage.getItem('demoMode') === 'true';
    }
    return false;
  }, [demoModeEnabled]);

  const verifyAuth = useCallback(async () => {
    // Check for demo mode first - this will detect mode switches and clear demo data
    const isDemo = await checkDemoMode();
    
    if (isDemo) {
      // If we have a user and it's not demo user, clear it
      setUser(prev => {
        if (prev && !prev.isDemo) {
          return null;
        }
        return prev;
      });
      // Set demo user and continue
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }

    // Not in demo mode - require authentication
    // If we had demo user, clear it
    setUser(prev => {
      if (prev?.isDemo) {
        return null;
      }
      return prev;
    });

    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      setUser(null);
      return;
    }

    try {
      const data = await apiCall('/api/auth/me');
      if (data && data.user) {
        setUser(data.user);
      } else {
        removeAuthToken();
        setUser(null);
      }
    } catch (error) {
      console.error('Auth verification failed:', error);
      removeAuthToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [checkDemoMode]);

  useEffect(() => {
    verifyAuth();

    // Listen for storage events (when token is set in another tab/window)
    const handleStorageChange = (e) => {
      if (e.key === 'authToken' || e.key === 'demoMode') {
        verifyAuth();
      }
    };

    // Listen for custom event when token is set in same tab
    const handleTokenSet = () => {
      verifyAuth();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('authTokenSet', handleTokenSet);

    // Periodically check for demo mode changes (every 30 seconds)
    const modeCheckInterval = setInterval(() => {
      checkDemoMode().then((isDemo) => {
        // If mode changed, trigger auth verification
        const currentState = demoModeEnabled !== null ? demoModeEnabled : (localStorage.getItem('demoMode') === 'true');
        if (currentState !== isDemo) {
          verifyAuth();
        }
      });
    }, 30000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('authTokenSet', handleTokenSet);
      clearInterval(modeCheckInterval);
    };
  }, [verifyAuth, checkDemoMode, demoModeEnabled]);

  const logout = async () => {
    // Handle demo mode logout
    const isDemo = isDemoMode();
    if (isDemo) {
      localStorage.removeItem('demoMode');
      localStorage.removeItem('demo_conversations');
      setUser(null);
      setDemoModeEnabled(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return;
    }

    const token = getAuthToken();
    if (token) {
      try {
        await apiCall('/api/auth/logout', { method: 'POST' });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    removeAuthToken();
    setUser(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return {
    user,
    loading,
    logout,
    isAdmin: user?.role === 'ADMIN',
    refreshAuth: verifyAuth,
    isDemoMode: isDemoMode(),
  };
};

