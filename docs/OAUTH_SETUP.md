# OAuth Login Integration Guide

## Overview
This guide walks you through setting up OAuth login for the Repo Deployer application using GitHub and Google OAuth.

## Features
- ✅ Login with GitHub OAuth
- ✅ Login with Google OAuth  
- ✅ Automatic user creation on first OAuth login
- ✅ Token persistence and session management
- ✅ Fallback to email/password login

## Prerequisites
- Repo Deployer running locally (http://localhost:3000)
- Backend API accessible at http://localhost:8000
- PostgreSQL database running
- `.env` file configured (copy from `.env.example`)

## Setup Instructions

### 1. GitHub OAuth Setup

#### Create GitHub OAuth Application
1. Go to https://github.com/settings/developers
2. Click "OAuth Apps" in the left menu
3. Click "New OAuth App"
4. Fill in the form with these values:
   - **Application name:** Repo Deployer
   - **Homepage URL:** http://localhost:3000
   - **Application description:** Repository management and deployment tool
   - **Authorization callback URL:** http://localhost:3000/auth/github/callback

5. Click "Register application"
6. You'll see the Client ID - copy it
7. Click "Generate a new client secret"
8. Copy the client secret (it will only show once)

#### Add to .env File
```
GITHUB_OAUTH_CLIENT_ID=your_client_id_here
GITHUB_OAUTH_CLIENT_SECRET=your_client_secret_here
GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/auth/github/callback
```

### 2. Google OAuth Setup

#### Create Google Cloud Project
1. Go to https://console.cloud.google.com/
2. Create a new project named "Repo Deployer"
3. Once created, select it from the project dropdown
4. In the search bar, search for "Google+ API"
5. Click "Google+ API" and then click "Enable"

#### Create OAuth 2.0 Credentials
1. Go to "Credentials" in the left menu
2. Click "Create Credentials" > "OAuth 2.0 Client ID"
3. You may be asked to create a consent screen first:
   - Select "External" user type
   - Fill in app name: "Repo Deployer"
   - Add your email as support contact
   - Add scopes: email, profile
   - Add your email as a test user
4. After consent screen is created, go back to Credentials
5. Click "Create Credentials" > "OAuth 2.0 Client ID" again
6. Select "Web application"
7. Under "Authorized JavaScript origins" add:
   - http://localhost
   - http://localhost:3000
   - http://127.0.0.1:3000
8. Under "Authorized redirect URIs" add:
   - http://localhost:3000/auth/google/callback
9. Click "Create"
10. Copy your Client ID and Client Secret

#### Add to .env File
```
GOOGLE_OAUTH_CLIENT_ID=your_client_id_here
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret_here
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

### 3. Environment Configuration

Make sure your `.env` file includes:
```
SECRET_KEY=your-secret-key-min-32-chars
GITHUB_TOKEN=your_github_token_here
GITHUB_OAUTH_CLIENT_ID=your_github_oauth_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/auth/github/callback
GOOGLE_OAUTH_CLIENT_ID=your_google_oauth_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

### 4. Restart Services

After updating `.env`, restart the docker containers:
```bash
docker-compose down -v
docker-compose up --build
```

## Usage

### Login Flow

#### GitHub Login
1. Navigate to http://localhost:3000/login
2. Click "GitHub" button
3. You'll be redirected to GitHub to authorize the application
4. After authorization, you'll be logged in automatically
5. A new user account will be created with your GitHub information

#### Google Login
1. Navigate to http://localhost:3000/login
2. Click "Google" button
3. You'll be redirected to Google to authorize the application
4. After authorization, you'll be logged in automatically
5. A new user account will be created with your Google information

#### Email/Password Login
1. Still available on the login page
2. Use any email and password for demo purposes

### Token Management

- Tokens are stored in localStorage as `auth_token`
- Tokens automatically included in API requests
- Token type stored as `auth_type` (Bearer)
- User email stored as `username`

## Troubleshooting

### "Authorization code is required"
- OAuth provider didn't return a code
- Check that redirect URL matches exactly in OAuth app settings
- Clear browser cache and try again

### "Failed to exchange authorization code"
- OAuth provider rejected the code exchange
- Verify CLIENT_ID and CLIENT_SECRET are correct
- Verify REDIRECT_URI matches exactly
- Check that the code hasn't expired (Google codes expire in ~10 minutes)

### "Failed to retrieve GitHub/Google user data"
- Scopes may be insufficient
- For GitHub: ensure `public_repo` or similar scope is set
- For Google: ensure `email` and `profile` scopes are enabled
- Try re-authorizing the application

### User Can't Login After First Time
- Check that user was created in database
- Verify that oauth_id (github_id or google_id) is stored correctly
- Check that user's email matches between OAuth and database

### CORS Errors
- Backend API should be accessible from localhost:3000
- Check docker-compose.yml has correct CORS configuration
- In FastAPI, ensure CORS middleware is enabled for http://localhost:3000

## Development Notes

### Key Files
- **Backend OAuth Service:** `backend/services/oauth.py`
- **Backend Auth Routes:** `backend/routes/auth.py`
- **Frontend Auth Context:** `frontend/src/contexts/AuthContext.tsx`
- **Frontend Login Page:** `frontend/src/pages/LoginPage.tsx`
- **Frontend OAuth Callbacks:** 
  - `frontend/src/pages/GitHubLoginPage.tsx`
  - `frontend/src/pages/GoogleLoginPage.tsx`

### API Endpoints
- `POST /api/auth/oauth/github/callback` - Exchange GitHub code for token
- `POST /api/auth/oauth/google/callback` - Exchange Google code for token
- `GET /api/auth/oauth/github/authorize` - Get GitHub auth URL
- `GET /api/auth/oauth/google/authorize` - Get Google auth URL

### Database
- User OAuth IDs stored in `User.github_id` and `User.google_id`
- Auth provider stored in `User.auth_provider` (local/github/google)
- User profile info from OAuth stored in `User.profile` (JSON)

## Future Enhancements
- [ ] Add refresh token rotation
- [ ] Add logout endpoint
- [ ] Add PKCE flow for enhanced security
- [ ] Add client-side token refresh
- [ ] Add user permissions/roles
- [ ] Add multi-provider linking (link GitHub and Google to same account)
