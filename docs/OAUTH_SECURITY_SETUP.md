# OAuth Security Implementation & Setup Guide

## Overview

This document outlines the OAuth 2.0 security implementation for Repo Deployer, including CSRF protection, state parameter validation, and step-by-step setup instructions for GitHub and Google OAuth.

## Security Features Implemented

### 1. CSRF (Cross-Site Request Forgery) Protection
- **State Parameter**: Unique random state parameter generated client-side
- **Storage**: State stored in browser's sessionStorage during OAuth flow
- **Validation**: State parameter validated on callback to prevent CSRF attacks
- **Cleanup**: State automatically cleared after validation or callback error

### 2. Authorization Code Flow
- Uses OAuth 2.0 Authorization Code Flow (most secure for web apps)
- Code exchanged server-side (never exposed to client-side)
- Access tokens managed securely server-side
- JWT tokens issued to frontend for session management

### 3. Token Management
- Access tokens stored in JWT format
- Tokens include expiration times (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- Session storage of authentication state
- Secure token transmission via HTTP-only cookies (recommended in production)

## Environment Variables Required

Add these to your `.env` file:

### GitHub OAuth
```env
GITHUB_OAUTH_CLIENT_ID=your_github_oauth_client_id_here
GITHUB_OAUTH_CLIENT_SECRET=your_github_oauth_client_secret_here
GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/auth/github/callback
GITHUB_TOKEN=your_github_api_token_here  # Optional
```

### Google OAuth
```env
GOOGLE_OAUTH_CLIENT_ID=your_google_oauth_client_id_here.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your_google_oauth_client_secret_here
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

### General OAuth Configuration
```env
# JWT Configuration
SECRET_KEY=your-super-secret-key-change-this-in-production-min-32-chars
ACCESS_TOKEN_EXPIRE_MINUTES=30
ALGORITHM=HS256

# Frontend URL for email links
FRONTEND_URL=http://localhost:3000
```

## GitHub OAuth Setup

### Step 1: Create GitHub OAuth Application

1. Go to [GitHub Settings > Developer Settings > OAuth Apps](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in the application details:
   - **Application name**: `Repo Deployer` (or your app name)
   - **Homepage URL**: `http://localhost:3000` (adjust for production)
   - **Application description**: `Deploy Docker containers from GitHub repositories`
   - **Authorization callback URL**: `http://localhost:3000/auth/github/callback`

### Step 2: Copy Credentials

1. After creating the app, you'll see:
   - **Client ID** - Copy to `GITHUB_OAUTH_CLIENT_ID`
   - **Client Secret** - Click "Generate a new client secret" and copy to `GITHUB_OAUTH_CLIENT_SECRET`

### Step 3: (Optional) Create GitHub Personal Access Token

For accessing repository metadata without rate limiting:

1. Go to [GitHub Settings > Developer Settings > Personal access tokens](https://github.com/settings/tokens)
2. Click **"Generate new token"**
3. Name it: `Repo Deployer API`
4. Select scopes:
   - `repo` - Full control of private repositories
   - `public_repo` - Access public repositories
   - `read:user` - Read user profile data
5. Copy token to `GITHUB_TOKEN`

## Google OAuth Setup

### Step 1: Create Google OAuth Application

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project:
   - Click project dropdown > **New Project**
   - Name: `Repo Deployer`
   - Click **Create**

### Step 2: Enable OAuth 2.0

1. In the Cloud Console, go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. If prompted, click **Configure Consent Screen** first:
   - Choose **External** user type
   - Fill in app details:
     - App name: `Repo Deployer`
     - User support email: your-email@example.com
     - Developer contact email: your-email@example.com
   - In scopes, add: `openid`, `email`, `profile`
   - Add test users if in development mode

### Step 3: Create OAuth Client

1. Go back to **Credentials > Create Credentials > OAuth client ID**
2. Select **Web application**
3. Configure:
   - **Name**: `Repo Deployer Web Client`
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (development)
     - Your production domain
   - **Authorized redirect URIs**:
     - `http://localhost:3000/auth/google/callback`
     - Your production callback URL
4. Click **Create**
5. Copy the credentials:
   - **Client ID** → `GOOGLE_OAUTH_CLIENT_ID`
   - **Client Secret** → `GOOGLE_OAUTH_CLIENT_SECRET`

## Frontend OAuth Flow

### State Parameter Generation

When user initiates OAuth login:

```typescript
// Generate random state parameter for CSRF protection
const state = Math.random().toString(36).substring(2, 15) + 
             Math.random().toString(36).substring(2, 15);

// Store in sessionStorage
sessionStorage.setItem('github_oauth_state', state);

// Redirect to OAuth provider with state parameter
```

### Callback Handling

Upon return from OAuth provider:

```typescript
// Retrieve and validate state parameter
const state = searchParams.get('state');
const storedState = sessionStorage.getItem('github_oauth_state');

if (!state || state !== storedState) {
  // CSRF attack detected!
  throw new Error('Invalid state parameter. Possible CSRF attack detected.');
}

// Clear stored state
sessionStorage.removeItem('github_oauth_state');

// Exchange code for token
const response = await fetch('/api/auth/oauth/github/callback', {
  method: 'POST',
  body: JSON.stringify({ code })
});

// Store received JWT token
localStorage.setItem('auth_token', data.access_token);
```

## Backend OAuth Flow

### Authorization Endpoint

1. Generate random state parameter
2. Redirect user to OAuth provider with:
   - `client_id`
   - `redirect_uri`
   - `state` (for CSRF protection)
   - `scope` (requested permissions)

### Callback Endpoint

1. Receive authorization code and state from OAuth provider
2. Validate state parameter matches stored value
3. Exchange code for access token:
   - Send `code`, `client_id`, `client_secret` to OAuth provider
   - Receive access token
4. Fetch user profile information using access token
5. Create or update user in database
6. Generate JWT token for frontend session
7. Redirect to frontend with authorization code

### Error Handling

The flow handles several error scenarios:

- **Invalid state**: CSRF attack detected, request rejected
- **Invalid code**: Authorization code expired or already used
- **Network errors**: Proper error messages returned to user
- **Rate limiting**: GitHub & Google API rate limits respected

## Production Deployment Checklist

### Security Configuration

- [ ] `SECRET_KEY` changed to a strong random value (min 32 characters)
- [ ] `ALGORITHM` set appropriately (HS256 for symmetric, RS256 for asymmetric)
- [ ] `DEBUG` set to `False`
- [ ] `ENVIRONMENT` set to `production`

### OAuth Configuration

- [ ] OAuth redirect URIs updated to production domain
- [ ] HTTPS enabled for all OAuth callbacks
- [ ] OAuth provider credentials securely stored (not in version control)
- [ ] Client secrets rotated regularly

### Email Configuration

- [ ] SMTP credentials configured for password resets
- [ ] `FRONTEND_URL` set to production domain
- [ ] Email templates reviewed for branding

### Database Security

- [ ] Database credentials changed from defaults
- [ ] PostgreSQL password set to strong value
- [ ] Database backups configured
- [ ] Connection string uses SSL/TLS

### Frontend Configuration

- [ ] `REACT_APP_API_URL` set to production API endpoint
- [ ] Remove debug console logs
- [ ] Enable CORS only for your domain

## Troubleshooting

### "Invalid state parameter" Error

**Cause**: Session cleared or browser security restrictions
**Solution**:
- Clear browser cache/cookies
- Ensure sessionStorage is enabled
- Check browser privacy settings

### "Authorization code expired" Error

**Cause**: User took too long to authorize (code valid for ~10 minutes)
**Solution**:
- User should click login button again
- Ensure system clock is synchronized

### GitHub Rate Limiting

**Cause**: Making too many API requests without authentication
**Solution**:
- Set `GITHUB_TOKEN` environment variable
- Implement caching for repository data
- See [GITHUB_API_RATE_LIMITING.md](./GITHUB_API_RATE_LIMITING.md)

### Google OAuth Scope Errors

**Cause**: Requesting scopes not configured in consent screen
**Solution**:
- Add scopes to Google Cloud Console consent screen
- Restart OAuth flow after scope changes
- For production, request app review for sensitive scopes

## References

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [OWASP: Cross-Site Request Forgery (CSRF)](https://owasp.org/www-community/attacks/csrf)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

## Support

For issues or questions about OAuth setup:

1. Check this guide's troubleshooting section
2. Review provider documentation (GitHub/Google)
3. Check application logs for detailed error messages
4. Open an issue with error logs and configuration details (sanitized)
