'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAuthToken, apiCall } from '@/utils/api';
import PageLoader from '@/components/PageLoader';

function AuthCallbackContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState('Authenticating...');

    useEffect(() => {
        const handleAuth = async () => {
            const token = searchParams.get('token');
            const error = searchParams.get('error');

            if (error) {
                console.error('Auth error:', error);
                setStatus('Authentication failed. Redirecting...');
                setTimeout(() => {
                    router.push(`/login?error=${encodeURIComponent(error)}`);
                }, 1500);
                return;
            }

            if (token) {
                try {
                    setAuthToken(token);
                    setStatus('Verifying authentication...');

                    const data = await apiCall('/api/auth/me');

                    if (data && data.user) {
                        setStatus('Success! Redirecting...');
                        setTimeout(() => {
                            router.push('/');
                        }, 500);
                    } else {
                        throw new Error('Invalid token response');
                    }
                } catch (error) {
                    console.error('Token verification failed:', error);
                    setStatus('Authentication failed. Redirecting...');
                    setTimeout(() => {
                        router.push('/login?error=verification_failed');
                    }, 1500);
                }
            } else {
                setStatus('No token received. Redirecting...');
                setTimeout(() => {
                    router.push('/login');
                }, 1500);
            }
        };

        handleAuth();
    }, [searchParams, router]);

    return <PageLoader text={status} />;
}

export default function AuthCallbackPage() {
    return (
        <Suspense fallback={<PageLoader text="Loading..." />}>
            <AuthCallbackContent />
        </Suspense>
    );
}

