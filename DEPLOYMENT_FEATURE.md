# Smart Repository Deployment System – Implementation Plan

## Objective
Build an intelligent Docker-based deployment system that detects repository stack, generates Docker configs, and deploys containers with minimal user input.

---

## Phase 1: Database & Core Data Models

### Step 1.1: Create Deployments Table
**Database Migration: 006_add_deployments_table.sql**

```sql
CREATE TABLE deployments (
    id SERIAL PRIMARY KEY,
    repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    repo_name VARCHAR(255) NOT NULL,
    stack VARCHAR(50) NOT NULL,
    confidence_score FLOAT DEFAULT 0.0,
    assigned_port INTEGER UNIQUE NOT NULL,
    domain VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    docker_path VARCHAR(500),
    dockerfile_content TEXT,
    compose_content TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    stopped_at TIMESTAMP,
    container_id VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deployments_repo ON deployments(repository_id);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_port ON deployments(assigned_port);
```

### Step 1.2: Update Repository Model
Add deployment-related fields to `models.py`:
- `deployment_id` (FK to deployments)
- `has_dockerfile` (boolean)
- `detected_stack` (string)

**Deliverable:** Database schema ready for deployment tracking

---

## Phase 2: Stack Detection Service

### Step 2.1: Create Stack Detection Engine
**File:** `backend/services/stack_detection.py`

Components:
- `StackDetector` class
- Methods:
  - `detect_from_dockerfile()` – Check for existing Dockerfile
  - `detect_from_compose()` – Check for docker-compose.yml
  - `detect_from_files()` – Check package.json, requirements.txt, composer.json, go.mod, Gemfile, etc.
  - `detect_from_readme()` – Parse README for run commands
  - `get_confidence_score()` – Calculate detection confidence (0-100)

Returns:
```python
{
    "stack": "node|python|php|go|ruby|etc",
    "confidence": 85,
    "has_dockerfile": boolean,
    "has_compose": boolean,
    "detected_db": "none|postgres|mysql|redis|etc",
    "internal_port": 8000|3000|etc
}
```

### Step 2.2: Create Stack Database
**File:** `backend/services/stack_templates.py`

Define stack configurations:
```python
STACKS = {
    "node": {
        "internal_port": 3000,
        "build_cmd": "npm install",
        "run_cmd": "npm start or npx next start or npm run dev",
        "files": ["package.json"],
        "environment": ["NODE_ENV=production"]
    },
    "python": {
        "internal_port": 8000,
        "build_cmd": "pip install -r requirements.txt",
        "run_cmd": "gunicorn|uvicorn",
        "files": ["requirements.txt"],
        "environment": ["PYTHONUNBUFFERED=1"]
    },
    # ... more stacks
}
```

**Deliverable:** Accurate stack detection for 8+ runtime types

---

## Phase 3: Docker File Generation

### Step 3.1: Create Dockerfile Generator
**File:** `backend/services/dockerfile_generator.py`

Class: `DockerfileGenerator`
- Method: `generate(stack, repo_path)` → returns Dockerfile content as string
- Use stack templates + intelligent runtime detection
- Support for:
  - Node.js (detect yarn vs npm, detect next.js vs express vs other)
  - Python (detect Django, FastAPI, Flask, etc.)
  - PHP (detect Laravel, WordPress, etc.)
  - Go, Ruby, Java, etc.

Example output:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Step 3.2: Create Docker Compose Generator
**File:** `backend/services/compose_generator.py`

Class: `ComposeGenerator`
- Method: `generate(repo_name, stack, port, db_type)` → docker-compose.yml content
- Include:
  - app service
  - optional db service (postgres/mysql/redis based on detection)
  - networking
  - volume mounts for development

**Deliverable:** Auto-generated valid Dockerfile and docker-compose.yml

---

## Phase 4: Deployment Port Management

### Step 4.1: Create Port Manager Service
**File:** `backend/services/port_manager.py`

Class: `PortManager`
- Method: `get_available_port(start_range=20000, end_range=40000)` → returns unused port
- Method: `is_port_available(port)` → checks if port is free
- Method: `reserve_port(port)` → marks port as used in DB

Logic:
1. Query deployments table for used ports
2. Check OS for open ports (using socket or netstat)
3. Return unused port from 20000-40000 range

**Deliverable:** Dynamic, conflict-free port assignment

---

## Phase 5: Deployment Execution Service

### Step 5.1: Create Deployment Manager
**File:** `backend/services/deployment_manager.py`

Class: `DeploymentManager`

Methods:
- `create_deployment(repo_id, stack, port)` → Creates deployment record
- `generate_files(deployment_id)` → Generates Dockerfile + compose
- `save_files(deployment_id)` → Saves to `repos/{repo}/.deployment/`
- `deploy(deployment_id)` → Runs `docker compose up -d --build`
- `get_container_id(deployment_id)` → Retrieves running container ID
- `stop_deployment(deployment_id)` → Stops and removes container
- `get_status(deployment_id)` → Returns container status

Execution flow:
```python
1. Create docker-compose.yml + Dockerfile in repos/{repo}/.deployment/
2. Run: docker compose -f {path}/docker-compose.yml up -d --build
3. Extract container ID from compose output
4. Store container_id + port in deployments table
5. Set status=running
```

### Step 5.2: Error Handling & Validation
- Pre-flight checks:
  - Docker daemon accessible
  - Repo path exists
  - Port not in use
- Deployment error capture:
  - docker build failures
  - port binding failures
  - runtime errors

**Deliverable:** Reliable container deployment with state tracking

---

## Phase 6: Logging & Container Inspection

### Step 6.1: Create Log Streaming Service
**File:** `backend/services/deployment_logs.py`

Class: `DeploymentLogs`
- Method: `get_logs(deployment_id, lines=100)` → docker logs {container}
- Method: `stream_logs(deployment_id)` → WebSocket/SSE for real-time logs
- Method: `get_container_stats(deployment_id)` → CPU, memory, network usage

### Step 6.2: Container Inspection
- Get container IP
- Get running port mapping
- Get health status
- Get resource usage

**Deliverable:** Real-time logs + container health monitoring

---

## Phase 7: Frontend Components (React/TypeScript)

### Step 7.1: Deployment Page Structure
**File:** `frontend/src/pages/DeploymentPage.tsx`

Layout sections:
1. **Repository Selector**
   - Dropdown of cloned repos only
   - OnChange → triggers detection
   
2. **Detection Panel**
   - Display detected stack + confidence
   - Show if existing Docker files found
   - Option to override stack selection
   
3. **Generated Files Editor**
   - Tabbed interface: Dockerfile | docker-compose.yml
   - Editable text areas (Monaco editor)
   - Syntax highlighting
   
4. **Deployment Settings**
   - Port display (auto-assigned)
   - Port edit field
   - Domain field (future)
   - Resource limits (future)
   
5. **Action Buttons**
   - "Detect" (manual re-trigger)
   - "Generate Files"
   - "Deploy"
   - "Stop"
   - "View Logs"

### Step 7.2: Logs Component
**File:** `frontend/src/components/DeploymentLogs.tsx`

Features:
- Real-time log streaming (WebSocket)
- Auto-scroll to latest
- Log level coloring (error=red, warn=yellow)
- Download logs button
- Clear logs button
- Line number display

### Step 7.3: Deployment Status Panel
**File:** `frontend/src/components/DeploymentStatus.tsx`

Displays:
- Container status (running/stopped/error)
- Assigned port
- Access URL (http://localhost:{port})
- Container resource usage (CPU, memory)
- Uptime

**Deliverable:** Complete deployment UI with real-time updates

---

## Phase 8: Backend API Routes

### Step 8.1: Create Deployment Routes
**File:** `backend/routes/deployment.py`

Endpoints:

```rest
POST /api/deployments/detect/{repo_id}
Response: {
  "stack": "node",
  "confidence": 90,
  "has_dockerfile": false,
  "internal_port": 3000,
  "detected_db": "none"
}

POST /api/deployments/generate/{repo_id}
Body: { "stack": "node", "port": 30000 }
Response: {
  "deployment_id": 123,
  "dockerfile": "FROM node...",
  "compose": "version: '3'..."
}

PUT /api/deployments/{id}/files
Body: { "dockerfile": "...", "compose": "..." }
Response: { "saved": true }

POST /api/deployments/{id}/deploy
Response: {
  "container_id": "abc123...",
  "status": "running",
  "port": 30000,
  "url": "http://localhost:30000"
}

POST /api/deployments/{id}/stop
Response: { "status": "stopped" }

GET /api/deployments/{id}/status
Response: {
  "status": "running",
  "container_id": "...",
  "port": 30000,
  "uptime_seconds": 3600,
  "cpu_percent": 0.5,
  "memory_mb": 120
}

GET /api/deployments/{id}/logs?lines=100
Response: { "logs": "...\n..." }

WebSocket /api/deployments/{id}/logs/stream
Real-time log streaming
```

### Step 8.2: List Deployments
```rest
GET /api/deployments?repo_id={id}
Response: [
  {
    "id": 1,
    "repo_name": "my-app",
    "stack": "node",
    "port": 30000,
    "status": "running",
    "created_at": "2026-02-05T...",
    "container_id": "..."
  }
]
```

**Deliverable:** Complete REST API for deployment lifecycle

---

## Phase 9: Integration & Testing

### Step 9.1: Wire Frontend to Backend
- Connect RepositoryList to Deployment routes
- Add navigation link from Dashboard to Deploy page
- Test detection accuracy with real repos

### Step 9.2: End-to-End Testing
Test scenarios:
1. Clone repo → Detect stack → Generate files → Deploy
2. Edit generated files → Re-deploy
3. Stop deployment → Clean up
4. Multi-deployment on same host
5. Port conflict handling

### Step 9.3: Error Scenarios
Test & docs:
- Docker unavailable
- Insufficient disk space
- Invalid Dockerfile
- Port already in use
- Container crashes at startup

**Deliverable:** Robust, tested deployment workflow

---

## Implementation Priority & Timeline

| Phase | Priority | Est. Time | Dependencies |
|-------|----------|-----------|--------------|
| 1 | P0 | 1 day | None |
| 2 | P0 | 2 days | Phase 1 |
| 3 | P0 | 2 days | Phase 2 |
| 4 | P1 | 1 day | Phase 1 |
| 5 | P0 | 3 days | Phase 2,3,4 |
| 6 | P1 | 2 days | Phase 5 |
| 7 | P0 | 4 days | Phase 5,6 |
| 8 | P0 | 2 days | Phase 5 |
| 9 | P0 | 2 days | All phases |

**Total Estimated: 2-3 weeks for MVP**

---

## File Structure After Implementation

```
backend/
├── services/
│   ├── stack_detection.py       (NEW)
│   ├── stack_templates.py       (NEW)
│   ├── dockerfile_generator.py  (NEW)
│   ├── compose_generator.py     (NEW)
│   ├── port_manager.py          (NEW)
│   ├── deployment_manager.py    (NEW)
│   ├── deployment_logs.py       (NEW)
│   └── ...existing services
├── routes/
│   ├── deployment.py            (NEW)
│   └── ...existing routes
├── migrations/
│   └── 006_add_deployments_table.sql (NEW)
└── ...existing structure

frontend/src/
├── pages/
│   └── DeploymentPage.tsx       (NEW)
├── components/
│   ├── DeploymentLogs.tsx       (NEW)
│   ├── DeploymentStatus.tsx     (NEW)
│   └── ...existing components
└── ...existing structure
```

---

## API Contract Summary

**Authentication:** Use existing JWT auth (extend to deployment routes)

**Error Responses:** Standard format:
```json
{
  "detail": "Error message",
  "error_code": "DEPLOYMENT_ERROR"
}
```

**Success Responses:** Standard format:
```json
{
  "success": true,
  "data": { ... }
}
```

---

## Security Considerations

- ✅ Validate all user inputs (files, ports, repo selection)
- ✅ Restrict deployments to cloned repos only (verify repo_id exists)
- ✅ Don't expose container secrets in logs
- ✅ Rate-limit deployment creation (prevent DoS)
- ✅ Validate Dockerfile before build (prevent malicious containers)
- ✅ Use non-root user in generated Dockerfiles

---

## Future Extensions (Post-MVP)

- [ ] Domain routing via reverse proxy (nginx/traefik)
- [ ] Automatic HTTPS (Let's Encrypt)
- [ ] Resource limits per deployment (CPU, memory)
- [ ] Health check integration
- [ ] Git-based auto-redeploy on push
- [ ] Multi-user support with deployment permissions
- [ ] Rollback to previous deployments
- [ ] Deployment metrics dashboard

