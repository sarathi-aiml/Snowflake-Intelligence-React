'use client';

import React, { useState } from 'react';
import { Loader2, Mail, Zap, Cloud } from 'lucide-react';

const Login = ({ projectLogoUrl, projectName }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState(null);

  // Use props with fallbacks
  const logoUrl = projectLogoUrl || '';
  const name = projectName || 'AI Intelligence Platform';

  const handleGoogleLogin = () => {
    setIsLoading(true);
    setLoadingProvider('google');
    const redirectUrl = encodeURIComponent(`${window.location.origin}/auth/callback`);
    window.location.href = `/api/auth/google?redirect=${redirectUrl}`;
  };

  const handleOutlookLogin = () => {
    setIsLoading(true);
    setLoadingProvider('outlook');
    const redirectUrl = encodeURIComponent(`${window.location.origin}/auth/callback`);
    // TODO: Implement Outlook OAuth
    window.location.href = `/api/auth/outlook?redirect=${redirectUrl}`;
  };

  const handleMicrosoftLogin = () => {
    setIsLoading(true);
    setLoadingProvider('microsoft');
    const redirectUrl = encodeURIComponent(`${window.location.origin}/auth/callback`);
    // TODO: Implement Microsoft OAuth
    window.location.href = `/api/auth/microsoft?redirect=${redirectUrl}`;
  };

  const handleAzureADLogin = () => {
    setIsLoading(true);
    setLoadingProvider('azure');
    const redirectUrl = encodeURIComponent(`${window.location.origin}/auth/callback`);
    // TODO: Implement Azure AD OAuth
    window.location.href = `/api/auth/azure?redirect=${redirectUrl}`;
  };

  return (
    <div className="login-container">
      <div className="farm-scene">
        <div className="sun"></div>

        <div className="cloud cloud-1"></div>
        <div className="cloud cloud-2"></div>
        <div className="cloud cloud-3"></div>
        <div className="cloud cloud-4 cloud-small"></div>
        <div className="cloud cloud-5 cloud-small"></div>
        <div className="cloud cloud-6 cloud-small"></div>
        <div className="cloud cloud-7 cloud-small"></div>
        <div className="cloud cloud-8 cloud-small"></div>
        <div className="cloud cloud-9 cloud-small"></div>
        <div className="cloud cloud-10 cloud-small"></div>

        <div className="field-rows"></div>

        <div className="crops">
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
          <div className="crop"></div>
        </div>

        {/* Static animals at the bottom */}
        <div className="horse horse-1" aria-hidden="true">🐎</div>
        <div className="goat goat-1" aria-hidden="true">🐐</div>
        <div className="horse horse-2" aria-hidden="true">🐎</div>
        <div className="goat goat-2" aria-hidden="true">🐐</div>
        <div className="horse horse-3" aria-hidden="true">🐎</div>
        <div className="goat goat-3" aria-hidden="true">🐐</div>
        <div className="horse horse-4" aria-hidden="true">🐎</div>
        <div className="goat goat-4" aria-hidden="true">🐐</div>
        <div className="horse horse-5" aria-hidden="true">🐎</div>
        <div className="goat goat-5" aria-hidden="true">🐐</div>
        <div className="cow cow-1" aria-hidden="true">🐄</div>
        <div className="cow cow-2" aria-hidden="true">🐄</div>
      </div>
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo-container">
            <img
              src={logoUrl}
              alt={`${name} Logo`}
              className="login-logo"
            />
          </div>
          <h1 className="login-title">{name}</h1>
          <p className="login-subtitle">
            Securely access your AI Assistant using your trusted enterprise or social account.
          </p>
        </div>
        <div className="login-buttons">
          <button
            onClick={handleGoogleLogin}
            className="login-btn login-btn-google"
            disabled={isLoading}
          >
            {isLoading && loadingProvider === 'google' ? (
              <>
                <Loader2 className="login-spinner" size={20} />
                <span>Redirecting...</span>
              </>
            ) : (
              <>
                <svg className="login-btn-icon" viewBox="0 0 24 24" width="20" height="20">
                  <path
                    fill="#fff"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#fff"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#fff"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#fff"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <button
            onClick={handleOutlookLogin}
            className="login-btn login-btn-outlook"
            disabled={true}
            title="Coming soon"
          >
            <Mail size={20} className="login-btn-icon" />
            Continue with Outlook
          </button>

          <button
            onClick={handleMicrosoftLogin}
            className="login-btn login-btn-microsoft"
            disabled={true}
            title="Coming soon"
          >
            <Zap size={20} className="login-btn-icon" />
            Continue with Microsoft
          </button>

          <button
            onClick={handleAzureADLogin}
            className="login-btn login-btn-azure"
            disabled={true}
            title="Coming soon"
          >
            <Cloud size={20} className="login-btn-icon" />
            Continue with Azure AD
          </button>
        </div>
        <div className="login-footer">
          <p className="login-terms">
            By logging in, you agree to our{' '}
            <a href="/terms" className="login-link">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="login-link">Privacy Policy</a>
          </p>
        </div>
      </div>
      <div className="login-copyright">
        © 2024 {name}. All rights reserved.
      </div>
    </div>
  );
};

export default Login;
