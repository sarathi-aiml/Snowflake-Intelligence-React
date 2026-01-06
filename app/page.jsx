'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ChatApp from '@/components/ChatApp';
import ProtectedRoute from '@/components/ProtectedRoute';
import { setAuthToken } from '@/utils/api';
import PageLoader from '@/components/PageLoader';

function HomePageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [tokenExtracted, setTokenExtracted] = useState(false);

    // Check if token is in URL (from OAuth redirect) and store it BEFORE rendering ChatApp
    useEffect(() => {
        const token = searchParams.get('token');
        if (token) {
            // Extract and store token immediately
            setAuthToken(token);
            // Remove token from URL without page reload
            const url = new URL(window.location.href);
            url.searchParams.delete('token');
            window.history.replaceState({}, '', url.pathname + url.search);
            setTokenExtracted(true);
        } else {
            setTokenExtracted(true);
        }
    }, [searchParams, router]);

    // Wait for token extraction before rendering ChatApp to avoid 401 errors
    if (!tokenExtracted) {
        return <PageLoader text="Loading..." />;
    }

    return <ChatApp />;
}

export default function HomePage() {
    return (
        <ProtectedRoute>
            <Suspense fallback={<PageLoader text="Loading..." />}>
                <HomePageContent />
            </Suspense>
        </ProtectedRoute>
    );
}

