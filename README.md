# Next.js AI Chat Application

A modern AI-powered chat application built with Next.js, featuring Snowflake Cortex Agents integration, Google OAuth authentication, and support for both demo and production modes.

<video src="https://github.com/user-attachments/assets/447803e8-719c-42f5-ab76-19c43a9dcf9b" controls></video>
---

## 📋 Table of Contents

1. [Demo Mode](#1-demo-mode)
2. [Production Mode](#2-production-mode)
3. [Migration & Setup Commands](#3-migration--setup-commands)
4. [Authentication Flow](#4-authentication-flow)
5. [Deployment](#deployment)
6. [Troubleshooting](#troubleshooting)

---

## 1. Demo Mode

**Perfect for testing without database setup. Agent configuration is required for chat functionality.**

### Quick Start

```bash
# 1. Clone and navigate
git clone <repository-url>
cd your-project-directory

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env

# 4. Configure .env file (minimum required for Demo Mode)
# Edit .env and set the following variables:

# 5. Run setup and start
npm run agent
npm run dev
```

**Open:** `http://localhost:3000`

### What Demo Mode Does:

- ✅ **No database connection** - Uses localStorage for data storage
- ✅ **No Google OAuth required** - Skip authentication setup
- ✅ **Quick testing** - Get started immediately
- ⚠️ **Agent configuration still required** - Chat functionality needs Snowflake Cortex Agent

### Demo Mode Environment Variables

#### Required Variables

```env
# Mode Configuration
DEMO=true

# Agent Configuration (Required for Chat)
SF_ACCOUNT_URL=https://your-account.snowflakecomputing.com
SF_DB=your_database
SF_SCHEMA=your_schema
SF_AGENT=your_agent_name
SF_BEARER_TOKEN=your_bearer_token
AGENT_NAME=Default Agent
```

#### Optional Variables

```env
# Warehouse (recommended for SQL operations)
SF_WAREHOUSE=your_warehouse

# Branding (Optional)
NEXT_PUBLIC_PROJECT_LOGO_URL=https://your-logo-url.com/logo.png
PROJECT_NAME=Your Project Name
```

---

## 2. Production Mode

**Full database integration with Snowflake and Google OAuth authentication.**

### Quick Start

```bash
# 1. Clone and navigate
git clone <repository-url>
cd your-project-directory

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env

# 4. Generate JWT Secret (if not already done)
npm run generate-jwt
# Copy the generated secret to your .env file

# 5. Configure .env file with all required variables for Production Mode
# Edit .env and set:
DEMO=false
SNOWFLAKE_ACCOUNT=your_account_identifier
SNOWFLAKE_USERNAME=your_username
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_WAREHOUSE=your_warehouse_name
SNOWFLAKE_DB=your_database_name
DB_SNOWFLAKE_SCHEMA=your_schema_name
JWT_SECRET=<paste-generated-secret-here>
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
ADMIN_EMAIL=admin@example.com
ADMIN_NAME=Admin User
SF_ACCOUNT_URL=https://your-account.snowflakecomputing.com
SF_DB=your_database
SF_SCHEMA=your_schema
SF_AGENT=your_agent_name
SF_BEARER_TOKEN=your_bearer_token
AGENT_NAME=Default Agent

# 6. Run setup and start
npm run agent
npm run dev
```

**Open:** `http://localhost:3000`

### Production Mode Environment Variables

#### Required Variables

```env
# Mode Configuration
DEMO=false

# Database Configuration
SNOWFLAKE_ACCOUNT=your_account_identifier
SNOWFLAKE_USERNAME=your_username
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_WAREHOUSE=your_warehouse_name
SNOWFLAKE_DB=your_database_name
DB_SNOWFLAKE_SCHEMA=your_schema_name

# Authentication Configuration
JWT_SECRET=your-secret-key                    # Generate using: npm run generate-jwt
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback  # For production: https://your-domain.com/api/auth/google/callback

# Admin Account Configuration
ADMIN_EMAIL=admin@example.com
ADMIN_NAME=Admin User

# Agent Configuration (Required for Chat)
SF_ACCOUNT_URL=https://your-account.snowflakecomputing.com
SF_DB=your_database
SF_SCHEMA=your_schema
SF_AGENT=your_agent_name
SF_BEARER_TOKEN=your_bearer_token
AGENT_NAME=Default Agent
```

#### Optional Variables

```env
# Token expiration (default: 7d)
JWT_EXPIRES_IN=7d

# Warehouse (optional but recommended)
SF_WAREHOUSE=your_warehouse

# Branding (Optional)
NEXT_PUBLIC_PROJECT_LOGO_URL=https://your-logo-url.com/logo.png
PROJECT_NAME=Your Project Name
```

#### Multiple Agents Configuration

For multiple agents, use the pattern `AGENT_<ID>_<PROPERTY>`:

```env
# Agent 1
AGENT_1_SF_ACCOUNT_URL=https://account1.snowflakecomputing.com
AGENT_1_SF_DB=database1
AGENT_1_SF_SCHEMA=schema1
AGENT_1_SF_AGENT=agent1
AGENT_1_SF_BEARER_TOKEN=token1
AGENT_1_SF_WAREHOUSE=warehouse1
AGENT_1_NAME=Primary Agent

# Agent 2
AGENT_2_SF_ACCOUNT_URL=https://account2.snowflakecomputing.com
AGENT_2_SF_DB=database2
AGENT_2_SF_SCHEMA=schema2
AGENT_2_SF_AGENT=agent2
AGENT_2_SF_BEARER_TOKEN=token2
AGENT_2_SF_WAREHOUSE=warehouse2
AGENT_2_NAME=Secondary Agent
```

---

## 3. Migration & Setup Commands

### Automatic Setup (Recommended)

```bash
# This command does everything automatically:
# - Installs dependencies
# - Validates environment variables
# - Creates database tables
# - Creates admin account based on environment variables: ADMIN_EMAIL, ADMIN_NAME
npm run agent
```

---

## 4. Authentication Flow

This application uses a **two-step authentication system**: Google OAuth for initial login and JWT tokens for session management.

### Overview

| Step | Technology | Purpose | When Used |
|------|-----------|---------|-----------|
| **Initial Login** | Google OAuth | Authenticate user identity | Once, when user first logs in |
| **Session Management** | JWT Tokens | Maintain user session | Every API request after login |
| **Token Security** | JWT_SECRET | Sign and verify tokens | When creating/validating tokens |

### Detailed Flow

#### Step 1: User Initiates Login

1. User clicks "Login with Google" button
2. Application redirects user to Google OAuth consent screen
3. User grants permission to the application

#### Step 2: Google Authentication

1. Google verifies the user's identity
2. Google redirects back to application with an authorization code
3. Application exchanges the code for user information:
   - Email address
   - Name
   - Profile picture

#### Step 3: JWT Token Creation

1. Application finds or creates user in database
2. Application creates a **JWT token** containing:
   - User ID
   - Email address
   - User role (USER/ADMIN)
3. Token is **signed with JWT_SECRET** for security
4. Token is sent to frontend and stored (cookie/localStorage)

#### Step 4: Session Management

1. Every API request includes the JWT token
2. Server **verifies the token** using `JWT_SECRET`
3. If valid, request is authenticated
4. User can access protected resources without logging in again

### Why Both Google OAuth and JWT?

**Google OAuth** is used for:
- ✅ Secure initial authentication
- ✅ No password management needed
- ✅ User identity verification

**JWT Tokens** are used for:
- ✅ Maintaining session after login
- ✅ Stateless authentication
- ✅ Fast API request validation

**JWT_SECRET** is required because:
- 🔐 **Signs tokens** when creating them (prevents tampering)
- 🔐 **Verifies tokens** when validating requests (ensures authenticity)
- 🔐 **Without it**, the application cannot create or verify tokens

### Generating JWT Secret

You can generate a secure JWT secret using one of these methods:

#### Method 1: Using the Provided Script (Recommended)

```bash
# Generate a secure JWT secret
node scripts/generate-jwt-secret.js
```

This will output a cryptographically secure secret that you can copy directly to your `.env` file:

```env
JWT_SECRET=<generated-secret-here>
```

#### Method 2: Using OpenSSL (Alternative)

```bash
# Generate a 32-byte base64 encoded secret
openssl rand -base64 32
```

Copy the output and add it to your `.env` file as `JWT_SECRET`.

#### Method 3: Using Node.js REPL

```bash
# Open Node.js REPL
node

# Run this command:
require('crypto').randomBytes(32).toString('base64')

# Copy the output to .env
```

### Security Notes

- **JWT_SECRET** must be kept secure and never exposed
- Generate a strong secret using one of the methods above
- **Never commit** `JWT_SECRET` to version control
- Use the **same secret** across all environments (dev, staging, production) for consistency
- Tokens expire after 7 days (configurable via `JWT_EXPIRES_IN`)
- Tokens are signed and cannot be modified without the secret

---

## Deployment

### Vercel

1. Push code to GitHub
2. Import repository to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy

**Note:** Set all required variables from `.env`. `VERCEL_URL` is auto-provided.

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Google OAuth Setup

**📺 Video Tutorials:**

For visual step-by-step guidance, search YouTube for:
- **"Google OAuth 2.0 Next.js tutorial"** - Complete setup guide
- **"Passport.js Google OAuth Next.js"** - Authentication implementation
- **"Next.js Google login authentication"** - Full authentication flow

**Popular Tutorial Channels:**
- Traversy Media
- Net Ninja
- Code with Harry
- Web Dev Simplified

**Quick YouTube Search:** [Search Google OAuth Next.js Tutorials](https://www.youtube.com/results?search_query=Google+OAuth+2.0+Next.js+tutorial)

---

## How to Create and Get Google OAuth Credentials

### Step 1: Create a Google Cloud Project

1. **Go to Google Cloud Console:**
   - Visit: [https://console.cloud.google.com/](https://console.cloud.google.com/)
   - Sign in with your Google account

2. **Create a New Project:**
   - Click the project dropdown at the top
   - Click **"New Project"**
   - Enter a project name (e.g., "My AI Chat App")
   - Click **"Create"**
   - Wait for the project to be created, then select it

### Step 2: Configure OAuth Consent Screen

1. **Navigate to OAuth Consent Screen:**
   - Go to **"APIs & Services"** → **"OAuth consent screen"** in the left sidebar
   - Select **"External"** (unless you have a Google Workspace account)
   - Click **"Create"**

2. **Fill in App Information:**
   - **App name:** Enter your application name (e.g., "My AI Chat Application")
   - **User support email:** Select your email address
   - **Developer contact information:** Enter your email address
   - Click **"Save and Continue"**

3. **Add Scopes:**
   - Click **"Add or Remove Scopes"**
   - Select the following scopes:
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
   - Click **"Update"** then **"Save and Continue"**

4. **Add Test Users (if in Testing mode):**
   - Add your email address as a test user
   - Click **"Save and Continue"**
   - Review and click **"Back to Dashboard"**

### Step 3: Create OAuth 2.0 Credentials

1. **Navigate to Credentials:**
   - Go to **"APIs & Services"** → **"Credentials"** in the left sidebar
   - Click **"+ CREATE CREDENTIALS"** at the top
   - Select **"OAuth client ID"**

2. **Configure OAuth Client:**
   - **Application type:** Select **"Web application"**
   - **Name:** Enter a name (e.g., "Web Client")

3. **Add Authorized Redirect URIs:**
   
   **For Local Development:**
   ```
   http://localhost:3000/api/auth/google/callback
   ```
   
   **For Production:**
   ```
   https://your-domain.com/api/auth/google/callback
   ```
   
   **For Multiple Environments (comma-separated):**
   ```
   http://localhost:3000/api/auth/google/callback,https://your-domain.com/api/auth/google/callback
   ```

4. **Create Credentials:**
   - Click **"Create"**
   - A popup will appear with your credentials

### Step 4: Copy Your Credentials

After creating the OAuth client, you'll see a popup with:

1. **Your Client ID:**
   - Format: `123456789-abcdefghijklmnop.apps.googleusercontent.com`
   - Copy this value → This is your `GOOGLE_CLIENT_ID`

2. **Your Client Secret:**
   - Format: `GOCSPX-abcdefghijklmnopqrstuvwxyz`
   - Click **"Show"** to reveal it
   - Copy this value → This is your `GOOGLE_CLIENT_SECRET`

3. **Your Callback URL:**
   - This is the **Authorized redirect URI** you added in Step 3
   - For local dev: `http://localhost:3000/api/auth/google/callback`
   - For production: `https://your-domain.com/api/auth/google/callback`
   - Copy this value → This is your `GOOGLE_CALLBACK_URL`

### Step 5: Add Credentials to .env File

Add the copied values to your `.env` file:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwxyz
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

**For Production:**
```env
GOOGLE_CALLBACK_URL=https://your-domain.com/api/auth/google/callback
```

### Step 6: Verify Your Setup

1. **Check Credentials Page:**
   - Go back to **"APIs & Services"** → **"Credentials"**
   - You should see your OAuth 2.0 Client ID listed
   - Click on it to view/edit if needed

2. **Important Notes:**
   - ✅ **Client ID** is public and can be exposed in frontend code
   - 🔐 **Client Secret** must be kept private (server-side only)
   - 🔐 **Never commit** `.env` file to version control
   - ✅ **Callback URL** must match exactly (including `http` vs `https`)

### Troubleshooting Google OAuth

| Issue | Solution |
|-------|----------|
| "redirect_uri_mismatch" error | Ensure `GOOGLE_CALLBACK_URL` in `.env` exactly matches the Authorized Redirect URI in Google Cloud Console |
| "invalid_client" error | Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct |
| OAuth consent screen not showing | Make sure you've completed the OAuth consent screen setup |
| "access_denied" error | Check that you've added test users (if in testing mode) or published the app |
| Works locally but not in production | Add production callback URL to Google Cloud Console and update `GOOGLE_CALLBACK_URL` in production `.env` |

### Quick Reference: Where to Find Your Credentials

- **Google Cloud Console:** [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
- **OAuth Consent Screen:** [https://console.cloud.google.com/apis/credentials/consent](https://console.cloud.google.com/apis/credentials/consent)
- **Your Project:** [https://console.cloud.google.com/](https://console.cloud.google.com/)

---

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Missing environment variable | Check `.env` has all required variables for your mode |
| Database connection failed | Verify Snowflake credentials, network, and warehouse status |
| Admin creation failed | Check `ADMIN_EMAIL` is set and database connection works |
| Google OAuth not working | Verify credentials and redirect URI matches exactly |
| Demo mode not working | Ensure `DEMO=true` in `.env`, clear localStorage, restart server |
| Cannot find module 'dotenv' | Run `npm run agent` - it installs dependencies automatically |
| JWT token errors | Verify `JWT_SECRET` is set and matches between server restarts |
| Hydration errors | Ensure `NEXT_PUBLIC_` prefix for client-side environment variables |

---

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Snowflake Documentation](https://docs.snowflake.com/)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [JWT Documentation](https://jwt.io/introduction)

---

## 🤝 Support

For issues or questions, please contact your system administrator or refer to the troubleshooting section above.

---

**Happy Coding! 🚀**

