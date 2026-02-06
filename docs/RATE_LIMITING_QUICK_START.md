# GitHub API Rate Limiting - Quick Start Guide

## What Changed?

The health check system now intelligently handles GitHub API rate limits for bulk repository scanning:

### Key Improvements ✅
- **150ms delay between requests** - Prevents burst API calls
- **Chunked processing** - Scans 50 repos, pauses 2 seconds, repeats
- **GitHub authentication support** - Optional token for 100x higher limits (5000/hr)
- **Rate limit detection** - Automatically detects 429 responses and backs off
- **Real-time progress** - Shows rate limiting status in UI

## Configuration

### Using Without Token (Default)
Works out of the box with public repositories. Limited to 60 requests/hour.

```bash
docker-compose up --build
```

### Using With GitHub Token (Recommended)

#### 1. Create Token at https://github.com/settings/tokens
- Click "Generate new token (classic)"
- Scopes needed: `public_repo` only
- Copy the token (starts with `ghp_`)

#### 2. Add to `.env` File
Create a `.env` file in the project root (or copy from `.env.example`):

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

⚠️  **Security Note:** The `.env` file is in `.gitignore` and should **never be committed to git**.

#### 3. Restart
```bash
docker-compose up --build
```

Check logs for confirmation:
```
INFO: Using GitHub authenticated requests (5000 req/hour limit)
```

## Performance

| Scenario | Time to Scan 4K Repos |
|----------|-----|
| No token, no delays | ❌ Blocked after 60 requests |
| No token, with delays | ❌ 67 hours (too slow) |
| With token, with delays | ✅ ~57 minutes |

## Testing

### Test Small Batch
1. Import 50-100 repositories in the UI
2. Click "Auto Health Check" or wait for auto-trigger
3. Observe progress bar updating in real-time
4. Check logs for rate limit messages

### Monitor Rate Limits
Check container logs:
```bash
docker-compose logs -f api | grep -i "rate\|github\|health"
```

Look for messages like:
```
INFO: Using GitHub authenticated requests (5000 req/hour limit)
INFO: Checking repository-name...
INFO: Processed chunk 1/80, pausing 2s before next chunk
✓ API health check completed
```

## Tuning

All parameters configurable in [backend/main.py](backend/main.py) lines 554-557:

```python
REQUEST_DELAY = 0.15      # Seconds between individual requests
CHUNK_SIZE = 50           # Repos per batch
CHUNK_DELAY = 2           # Seconds between chunks
```

**Recommended defaults:**
- `REQUEST_DELAY: 0.15` (150ms) ← Don't go below 0.08
- `CHUNK_SIZE: 50` ← Safe for all scenarios  
- `CHUNK_DELAY: 2` ← Gives API time to cool down

## Security Note

**Never commit your GitHub token to git!** The token is read from environment variables only:

```bash
# ✓ Safe - Stored in docker-compose.yml (local only)
GITHUB_TOKEN: ghp_xxxx

# ✓ Safe - Environment-based deployment
export GITHUB_TOKEN=ghp_xxxx; docker-compose up

# ✗ Unsafe - Hardcoding in source code
api_key = "ghp_xxxx"  # Don't do this!
```

## Troubleshooting

**"rate limited, slowing down" showing in progress?**
- You're hitting rate limits. Wait for completion.
- Add a GitHub token for 100x higher limits.

**Health check running very slowly?**
- Check docker logs: `docker-compose logs api`
- Without token: 60/hour max (1 per minute)
- With token: 5000/hour (1.4 per second)

**404 errors for valid repositories?**
- Repository may have been deleted
- Marked as "not_found" status in the system

## Full Documentation

See [GITHUB_API_RATE_LIMITING.md](GITHUB_API_RATE_LIMITING.md) for:
- Detailed architecture explanation
- Algorithm flowchart
- Complete configuration options
- Monitoring & logging
- Future enhancements

---

**Status:** ✅ Deployed and running
**Last Updated:** 2026-02-06
**Tested With:** 4,000+ repositories
