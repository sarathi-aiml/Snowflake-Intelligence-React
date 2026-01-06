import '@/app/globals.css';
import { ClientLayout } from './client-layout';

// Dynamic metadata generation for Next.js App Router
export async function generateMetadata() {
  // Get project info from environment variables (server-side only)
  const projectLogoUrl = process.env.NEXT_PUBLIC_PROJECT_LOGO_URL || process.env.PROJECT_LOGO_URL || '';
  const projectName = process.env.PROJECT_NAME || 'AI Intelligence Platform';

  return {
    title: projectName,
    description: `${projectName} - AI Intelligence Platform`,
    icons: {
      icon: projectLogoUrl || '/favicon.ico',
    },
    openGraph: {
      title: projectName,
      description: `${projectName} - AI Intelligence Platform`,
      ...(projectLogoUrl && { images: [projectLogoUrl] }),
    },
    twitter: {
      card: 'summary_large_image',
      title: projectName,
      description: `${projectName} - AI Intelligence Platform`,
      ...(projectLogoUrl && { images: [projectLogoUrl] }),
    },
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}

