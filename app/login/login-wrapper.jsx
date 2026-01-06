'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Login from '@/components/Login';
import { useAuth } from '@/hooks/useAuth';
import PageLoader from '@/components/PageLoader';

export function LoginWrapper({ projectLogoUrl, projectName }) {
    const router = useRouter();
    const { isDemoMode, loading } = useAuth();

    useEffect(() => {
        // If demo mode is enabled, redirect to home page
        if (!loading && isDemoMode) {
            router.push('/');
        }
    }, [isDemoMode, loading, router]);

    // Show loader while checking demo mode
    if (loading || isDemoMode) {
        return <PageLoader text="Loading..." />;
    }

    return <Login projectLogoUrl={projectLogoUrl} projectName={projectName} />;
}

