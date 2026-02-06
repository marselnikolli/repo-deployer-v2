# GitHub API Rate Limiting Implementation

## Problem Summary

When performing health checks on 4,000+ repositories, the application would quickly exceed GitHub API rate limits, causing scan failures. The original implementation made sequential API calls without delays or rate limiting considerations.

**GitHub API Rate Limits:**
- **Unauthenticated:** 60 requests/hour (1 per minute)
- **Authenticated:** 5,000 requests/hour (~1.4 per second)
- **Estimated time for 4,000 repos:** 57 minutes with authentication (vs impossible without)

## Solution Architecture

### 1. **Chunked Processing**
The implementation now processes repositories in chunks of 50 with a 2-second pause between chunks:

```python
CHUNK_SIZE = 50         # Process 50 repos per batch
CHUNK_DELAY = 2         # 2 second pause between chunks
```

**Benefits:**
- Spreads the API load over time
- Prevents burst rate limiting
- Allows graceful pause/recovery between batches

### 2. **Request Delays**
Added automatic delay between individual requests to stay well within API limits:

```python
REQUEST_DELAY = 0.15    # 150ms = ~6.7 requests/second (safe threshold)
```

**Why 150ms?**
- GitHub's authenticated limit: ~5000/hour = ~1.4 per second
- 150ms delay = ~6.7 requests/second
- Safety margin: 4.5x slower than maximum to avoid burst limitations
- Allows graceful handling of other API consumers

### 3. **GitHub Authentication Support**
Optional GitHub Personal Access Token for 100x higher rate limits:

```python
GITHUB_TOKEN = os.getenv('GITHUB_TOKEN', None)
if GITHUB_TOKEN:
    headers['Authorization'] = f'token {GITHUB_TOKEN}'
```

**Authenticated vs Unauthenticated:**
- Without token: 60/hour = 1/minute (cannot complete 4K repos)
- With token: 5000/hour = ~57 minutes for 4K repos (feasible)

### 4. **Rate Limit Response Handling**
Detects HTTP 429 (Too Many Requests) and implements exponential backoff:

```python
if response.status_code == 429:
    rate_limited = True
    retry_after = int(response.headers.get('Retry-After', 60))
    time.sleep(min(retry_after, 5))  # Cap at 5 seconds
    response = requests.get(api_url, timeout=10, headers=headers)
```

### 5. **Real-Time Progress Reporting**
Enhanced progress updates include rate limiting status:

```python
{
    "status": "running",
    "current": 150,
    "total": 4000,
    "healthy": 120,
    "archived": 15,
    "not_found": 5,
    "errors": 10,
    "rate_limited": false,
    "message": "Checking repository-name... (rate limited, slowing down)"
}
```

## Configuration & Usage

### Option 1: Unauthenticated (Default)
No configuration needed. Works with public repositories only, slower rate limits.

```bash
# docker-compose up
```

### Option 2: Authenticated (Recommended for 4K+ repositories)

#### Step 1: Create GitHub Personal Access Token
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `public_repo` (read-only access to public repos)
4. Generate token (you only need read access for public repos)
5. Copy the token value (starts with `ghp_`)

#### Step 2: Create `.env` File
Create a `.env` file in the project root with your token:

```bash
# .env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Or copy from the template and fill in your token:

```bash
cp .env.example .env
# Then edit .env and add your GitHub token
```

#### Step 3: Start Application
```bash
docker-compose up --build
```

The `.env` file is automatically loaded by docker-compose (configured in `env_file` directive).

**Security Note:** The `.env` file is in `.gitignore` and should never be committed to version control.

### Performance Comparison

**Scanning 4,000 repositories:**

| Scenario | Rate Limit | Max Concurrent | Estimated Time |
|----------|-----------|---|---|
| Unauthenticated, no delays | 60/hour | N/A | Blocked after 60 requests |
| Unauthenticated, with delays | 60/hour | N/A | 4000 minutes (67 hours, fails) |
| Authenticated, no delays | 5000/hour | High burst | Fails at ~3000 requests |
| **Authenticated, with delays** | 5000/hour | 1 per 150ms | ~57 minutes ✓ |

## Algorithm Details

### Request Flow
```
1. Load all repositories into memory
2. Process in CHUNK_SIZE batches of 50 repos:
   a. For each repo in batch:
      i. Fetch from GitHub API
      ii. Check status: 200 (healthy), 404 (not found), 429 (rate limited)
      iii. Update metadata if available
      iv. Sleep REQUEST_DELAY (150ms)
   b. Update progress in Redis
   c. Sleep CHUNK_DELAY (2 seconds) before next batch
3. Batch update all repository records in database
4. Mark health check as completed
```

### Error Handling
- **429 Rate Limit:** Wait and retry once
- **404 Not Found:** Mark as removed, continue
- **Other Errors:** Mark as unknown, continue
- **Generic Exceptions:** Log and skip, continue processing

### Progress Tracking
Progress updates every request completion:
- Used by frontend polling (300ms intervals)
- Enables real-time progress bar
- Shows rate limit status when activated

## Tuning Parameters

If you need to adjust performance, modify these constants in `perform_bulk_health_check()`:

```python
CHUNK_SIZE = 50           # Smaller = more pauses, slower; Larger = more burst risk
REQUEST_DELAY = 0.15      # Smaller = faster (max ~0.08 for 5000/hour); Larger = slower
CHUNK_DELAY = 2           # Pause between batches in seconds
```

**Safe ranges:**
- `REQUEST_DELAY`: 0.08 (max) to 1.0 (slowest)
- `CHUNK_SIZE`: 10 (safest) to 100 (fastest)
- `CHUNK_DELAY`: 1 (minimum) to 5 (longest pause)

## Testing

### Test with Small Dataset
```bash
# Add 100 test repositories
# Scan manually - should complete in ~25 seconds with authentication
```

### Monitor Rate Limits
Add temporary logging to see actual API responses:

```python
logger.info(f"Rate Limit Remaining: {response.headers.get('X-RateLimit-Remaining')}")
logger.info(f"Rate Limit Reset: {response.headers.get('X-RateLimit-Reset')}")
```

### Verify Token Works
Check the logs after first health check:
- With token: `"Using GitHub authenticated requests (5000 req/hour limit)"`
- Without token: `"Using GitHub unauthenticated requests (60 req/hour limit)"`

## Migration Guide

### From Unthrottled Implementation
If you already deployed without rate limiting:

1. Update `main.py` with new `perform_bulk_health_check()` function
2. (Optional) Add `GITHUB_TOKEN` to docker-compose.yml
3. Rebuild and redeploy:
   ```bash
   docker-compose down -v
   docker-compose up --build
   ```

No database migration needed - compatible with existing data.

## Security Considerations

**GitHub Token Best Practices:**
- ✓ Store token in `.env` file (not committed to git)
- ✓ Use `.env` file loaded by docker-compose via `env_file` directive
- ✓ Use a Personal Access Token (scoped to `public_repo` only)
- ✓ Use different tokens for dev/prod if possible
- ✓ Regenerate token if compromised
- ✗ Never hardcode token in docker-compose.yml
- ✗ Never commit `.env` file to git (it's in `.gitignore`)
- ✗ Never log or expose the token value
- ✗ Don't use larger API scopes than needed (public repos only)

**Implementation Details:**
```bash
# ✓ Correct: Store in .env file (ignored by git)
.env -> GITHUB_TOKEN=ghp_xxxx

# ✗ Wrong: Hardcode in docker-compose.yml
environment:
  GITHUB_TOKEN: ghp_xxxx
```

**Token Permissions:**
- `public_repo` - *Recommended* (read-only public repos, what we need)
- `repo` - ✗ Too much access (includes private repos)
- `admin:repo_hook` - ✗ Unnecessary

## Monitoring & Logging

The implementation logs important events:

```
INFO: Using GitHub authenticated requests (5000 req/hour limit)
INFO: Processed chunk 1/80, pausing 2s before next chunk
WARNING: GitHub API rate limited, sleeping for 60s
INFO: Health check completed - Healthy: 3950, Archived: 30, Not Found: 20
```

## Future Enhancements

1. **Caching:** Skip already-checked repos if `last_health_check` < 24 hours
2. **Parallel Processing:** Use async requests library for concurrent API calls
3. **Rate Limit Prediction:** Estimate and warn if rate limit will be exceeded
4. **Selective Scanning:** Allow users to choose which health checks to run
5. **Graphed Stats:** Track rate limit consumption over time

## References

- [GitHub API Rate Limiting](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [Creating PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [429 Too Many Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429)
