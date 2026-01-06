import { LoginWrapper } from './login-wrapper';

// Get project info from environment variables (server-side)
const projectLogoUrl = process.env.NEXT_PUBLIC_PROJECT_LOGO_URL || process.env.PROJECT_LOGO_URL || '';
const projectName = process.env.PROJECT_NAME || 'AI Intelligence Platform';

export default function LoginPage() {
    return <LoginWrapper projectLogoUrl={projectLogoUrl} projectName={projectName} />;
}

