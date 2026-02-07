# OAuth Quick Start Guide

## 5-Minute Setup

### Step 1: GitHub OAuth (Optional)
1. Visit https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - Name: `Repo Deployer`
   - Homepage: `http://localhost:3000`
   - Callback: `http://localhost:3000/auth/github/callback`
4. Copy Client ID and Secret
5. Add to `.env`:
```
GITHUB_OAUTH_CLIENT_ID=your_id
GITHUB_OAUTH_CLIENT_SECRET=your_secret
```

### Step 2: Google OAuth (Optional)
1. Visit https://console.cloud.google.com/
2. Create new project "Repo Deployer"
3. Enable Google+ API
4. Go to Credentials > OAuth 2.0 Client ID (Web)
5. Add authorized origins:
   - `http://localhost:3000`
   - `http://localhost`
6. Add redirect URI: `http://localhost:3000/auth/google/callback`
7. Copy Client ID and Secret
8. Add to `.env`:
```
GOOGLE_OAUTH_CLIENT_ID=your_id
GOOGLE_OAUTH_CLIENT_SECRET=your_secret
```

### Step 3: Start Application
```bash
cd repo-deployer-v2
docker-compose down -v
docker-compose up --build
```

### Step 4: Test
1. Browse to http://localhost:3000/login
2. Click "GitHub" or "Google" button
3. Authorize the application
4. You should be logged in automatically

## Testing Checklist

- [ ] GitHub OAuth login successful
- [ ] Google OAuth login successful
- [ ] User created in database after OAuth login
- [ ] Token stored in localStorage
- [ ] Can navigate to protected routes after OAuth login
- [ ] Logout clears token
- [ ] OAuth buttons visible on login page
- [ ] Redirect to home page after successful login

## Common Issues

### Blank login page
- Check browser console for errors
- Verify backend is running on port 8000
- Clear browser cache

### "Authorization code is required"  
- OAuth redirect URL doesn't match exactly
- Browser blocked redirect
- OAuth app configuration incorrect

### Users not being created
- Check database connection
- Verify migrations ran successfully
- Check backend logs for database errors

### Token not stored
- Check browser localStorage settings
- Look for JavaScript errors in console
- Verify API is returning access_token

## Next Steps

After successful OAuth login:
1. Complete Task 2: Password Reset & Email Confirmation
2. Complete Task 6: Auto Metadata Updates Scheduler

Detailed setup: See `docs/OAUTH_SETUP.md`
