'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import PageLoader from '@/components/PageLoader';

const ProtectedRoute = ({ children }) => {
  const { user, loading, isDemoMode } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for loading to complete
    if (loading) {
      return;
    }

    // In demo mode, allow access without redirecting
    if (isDemoMode) {
      return;
    }

    // Not in demo mode - require authentication
    if (!user) {
      router.push('/login');
    }
  }, [user, loading, router, isDemoMode]);

  if (loading) {
    return <PageLoader text="Loading..." />;
  }

  // In demo mode, allow access even without user (demo user will be set)
  if (!user && !isDemoMode) {
    return <PageLoader text="Redirecting to login..." />;
  }

  return children;
};

export default ProtectedRoute;

