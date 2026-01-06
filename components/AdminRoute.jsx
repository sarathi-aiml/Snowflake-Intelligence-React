'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import PageLoader from '@/components/PageLoader';

const AdminRoute = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <PageLoader text="Loading..." />;
  }

  if (!user) {
    return <PageLoader text="Redirecting to login..." />;
  }

  if (!isAdmin) {
    return (
      <div className="access-denied-container">
        <div className="access-denied-content">
          <h2>Access Denied</h2>
          <p>Admin privileges required to access this page.</p>
          <button onClick={() => router.push('/')} className="btn-primary">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return children;
};

export default AdminRoute;

