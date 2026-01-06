'use client';

import { ThemeProvider } from '@/contexts/ThemeContext';

export function ClientLayout({ children }) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}

