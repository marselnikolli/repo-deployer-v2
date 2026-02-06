## Deployment API Usage Guide

### Quick Start

The deployment system provides a complete REST API for deploying repositories to Docker. This guide shows how to use each endpoint.

---

### 1. Stack Detection

**Endpoint**: `POST /api/deployments/detect`

Detect the programming language and framework of a repository.

**Request**:
```json
{
  "repo_id": 1,
  "repo_path": "/path/to/cloned/repo"
}
```

**Response** (Example - Node.js):
```json
{
  "stack": "node",
  "confidence_score": 95,
  "framework": "Next.js",
  "detected_files": ["package.json", "package-lock.json", "next.config.js"],
  "requires_db": true,
  "internal_port": 3000,
  "build_command": "npm install",
  "run_command": "npm start"
}
```

**Response** (Example - Python):
```json
{
  "stack": "python",
  "confidence_score": 90,
  "framework": "FastAPI",
  "detected_files": ["requirements.txt", "main.py"],
  "requires_db": true,
  "internal_port": 8000,
  "build_command": "pip install -r requirements.txt",
  "run_command": "python main.py"
}
```

---

### 2. Create Deployment

**Endpoint**: `POST /api/deployments/create`

Prepare a deployment by detecting the stack and generating Docker files.

**Request**:
```json
{
  "repo_id": 1,
  "repo_name": "my-node-app",
  "repo_path": "/path/to/cloned/repo"
}
```

**Response**:
```json
{
  "id": 42,
  "repository_id": 1,
  "repo_name": "my-node-app",
  "stack": "node",
  "confidence_score": 95,
  "assigned_port": 20001,
  "status": "pending",
  "container_id": null,
  "error_message": null,
  "log_tail": null,
  "created_at": "2024-01-15T10:30:00",
  "started_at": null,
  "stopped_at": null
}
```

**What happens**:
1. Stack is detected
2. Port is allocated from 20000-40000 range
3. Dockerfile is generated (from stack templates)
4. docker-compose.yml is generated
5. Deployment record is saved to database
6. Status is set to "pending"

---

### 3. Start Deployment

**Endpoint**: `POST /api/deployments/start`

Build and deploy the Docker container.

**Request**:
```json
{
  "deployment_id": 42,
  "repo_path": "/path/to/cloned/repo"
}
```

**Response**:
```json
{
  "id": 42,
  "repository_id": 1,
  "repo_name": "my-node-app",
  "stack": "node",
  "confidence_score": 95,
  "assigned_port": 20001,
  "status": "running",
  "container_id": "abc123def456",
  "error_message": null,
  "log_tail": "Server running on port 3000\n...",
  "created_at": "2024-01-15T10:30:00",
  "started_at": "2024-01-15T10:32:15",
  "stopped_at": null
}
```

**What happens**:
1. Writes Dockerfile to repo
2. Writes docker-compose.yml to repo
3. Builds Docker image (`docker build`)
4. Starts containers (`docker-compose up -d`)
5. Gets container ID and initial logs
6. Status set to "running"
7. Container accessible on assigned port

---

### 4. Get Deployment Status

**Endpoint**: `GET /api/deployments/{deployment_id}`

Get current status of a deployment.

**Response**:
```json
{
  "id": 42,
  "repository_id": 1,
  "repo_name": "my-node-app",
  "stack": "node",
  "confidence_score": 95,
  "assigned_port": 20001,
  "status": "running",
  "container_id": "abc123def456",
  "error_message": null,
  "log_tail": "Server running on port 3000\n...",
  "created_at": "2024-01-15T10:30:00",
  "started_at": "2024-01-15T10:32:15",
  "stopped_at": null
}
```

---

### 5. List Deployments for Repository

**Endpoint**: `GET /api/deployments/repo/{repository_id}`

List all deployments for a specific repository.

**Response**:
```json
[
  {
    "id": 42,
    "repository_id": 1,
    "repo_name": "my-node-app",
    "stack": "node",
    "assigned_port": 20001,
    "status": "running",
    "created_at": "2024-01-15T10:30:00"
  },
  {
    "id": 41,
    "repository_id": 1,
    "repo_name": "my-node-app",
    "stack": "node",
    "assigned_port": 20000,
    "status": "stopped",
    "created_at": "2024-01-15T09:00:00"
  }
]
```

---

### 6. Stop Deployment

**Endpoint**: `POST /api/deployments/stop/{deployment_id}`

Stop a running deployment.

**Response**:
```json
{
  "id": 42,
  "repository_id": 1,
  "repo_name": "my-node-app",
  "stack": "node",
  "confidence_score": 95,
  "assigned_port": 20001,
  "status": "stopped",
  "container_id": "abc123def456",
  "error_message": null,
  "log_tail": "Shutdown...\n",
  "created_at": "2024-01-15T10:30:00",
  "started_at": "2024-01-15T10:32:15",
  "stopped_at": "2024-01-15T10:45:30"
}
```

---

### 7. Restart Deployment

**Endpoint**: `POST /api/deployments/restart/{deployment_id}`

Restart a stopped deployment.

**Response**:
```json
{
  "id": 42,
  "repository_id": 1,
  "repo_name": "my-node-app",
  "stack": "node",
  "confidence_score": 95,
  "assigned_port": 20001,
  "status": "running",
  "container_id": "abc123def456",
  "error_message": null,
  "log_tail": "Server running on port 3000\n...",
  "created_at": "2024-01-15T10:30:00",
  "started_at": "2024-01-15T10:50:00",
  "stopped_at": null
}
```

---

### 8. Delete Deployment

**Endpoint**: `DELETE /api/deployments/{deployment_id}`

Delete a deployment and release its port.

**Response**:
```json
{
  "status": "success",
  "message": "Deployment deleted",
  "deployment_id": 42
}
```

**What happens**:
1. Stops container if running (`docker-compose down`)
2. Releases port back to pool
3. Deletes deployment record from database

---

## Complete Workflow Example

### Scenario: Deploy a Node.js repository

```python
import requests

API_URL = "http://localhost:8000/api/deployments"
REPO_ID = 1
REPO_PATH = "/var/clones/my-node-app"
REPO_NAME = "my-node-app"

# Step 1: Detect stack
detect_response = requests.post(
    f"{API_URL}/detect",
    json={
        "repo_id": REPO_ID,
        "repo_path": REPO_PATH
    }
)
detection = detect_response.json()
print(f"Detected: {detection['stack']} ({detection['confidence_score']}%)")
# Output: Detected: node (95%)

# Step 2: Create deployment
create_response = requests.post(
    f"{API_URL}/create",
    json={
        "repo_id": REPO_ID,
        "repo_name": REPO_NAME,
        "repo_path": REPO_PATH
    }
)
deployment = create_response.json()
deployment_id = deployment['id']
port = deployment['assigned_port']
print(f"Deployment created: ID={deployment_id}, Port={port}")
# Output: Deployment created: ID=42, Port=20001

# Step 3: Start deployment
start_response = requests.post(
    f"{API_URL}/start",
    json={
        "deployment_id": deployment_id,
        "repo_path": REPO_PATH
    }
)
deployment = start_response.json()
print(f"Status: {deployment['status']}")
print(f"Container: {deployment['container_id']}")
print(f"Access at: http://localhost:{port}")
# Output: 
# Status: running
# Container: abc123def456
# Access at: http://localhost:20001

# Step 4: Get status
status_response = requests.get(f"{API_URL}/{deployment_id}")
deployment = status_response.json()
print(f"Deployment logs:\n{deployment['log_tail']}")

# Step 5: Stop (optional)
requests.post(f"{API_URL}/stop/{deployment_id}")

# Step 6: Delete
requests.delete(f"{API_URL}/{deployment_id}")
```

---

## Supported Stacks & Ports

| Stack | Default Port | Database | Framework Examples |
|-------|------|----------|-------------------|
| Node.js | 3000 | Optional | Express, React, Vue, Next.js, NestJS |
| Python | 8000 | Optional | Django, Flask, FastAPI |
| PHP | 8000 | Optional | Laravel, Symfony, WordPress |
| Go | 8080 | Optional | Gin, Echo, Chi |
| Ruby | 3000 | Optional | Rails, Sinatra |
| Java | 8080 | Optional | Spring Boot, Quarkus |
| C# / .NET | 5000 | Optional | ASP.NET Core |
| Rust | 8080 | No | Actix-web, Rocket |
| Static | 3000 | No | HTML/CSS/JS |

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK` - Successful request
- `400 Bad Request` - Invalid input (e.g., invalid repo path)
- `404 Not Found` - Deployment not found
- `500 Internal Server Error` - Server error (docker not running, disk full, etc.)

**Error Response Example**:
```json
{
  "detail": "Failed to detect stack. Repository may be empty or invalid."
}
```

---

## Database Deployment

When a deployment is created with a database-requiring stack, the docker-compose.yml automatically includes:

### PostgreSQL (default)
```
DATABASE_URL=postgresql://appuser:apppassword@database:5432/repo_name
```

### MySQL
```
DATABASE_URL=mysql://appuser:apppassword@database:3306/repo_name
```

### MongoDB
```
MONGODB_URI=mongodb://appuser:apppassword@database:27017/repo_name
```

Default credentials:
- **Username**: `appuser`
- **Password**: `apppassword`
- **Database**: `{repo_name}`

---

## Next Steps

1. Container logging endpoint (WebSocket for real-time logs)
2. Deployment health checks
3. Auto-restart on failure
4. Multiple deployments per repository
5. Custom environment variables per deployment
