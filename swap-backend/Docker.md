# Docker Setup cho MoonX Swap Backend

## 🐳 Quick Start

### Prerequisites
- Docker và Docker Compose đã được cài đặt
- File `.env` đã được cấu hình (copy từ `.env.example`)

### Development Environment

```bash
# Build và start development container
docker-compose --profile dev up --build

# Hoặc run in background
docker-compose --profile dev up -d --build

# View logs
docker-compose --profile dev logs -f

# Stop containers
docker-compose --profile dev down
```

### Production Environment

```bash
# Build và start production container
docker-compose --profile prod up --build

# Hoặc run in background
docker-compose --profile prod up -d --build

# View logs
docker-compose --profile prod logs -f

# Stop containers
docker-compose --profile prod down
```

## 🔧 Docker Commands

### Build Images

```bash
# Build development image
docker build --target development -t moonx-backend:dev .

# Build production image
docker build --target production -t moonx-backend:prod .

# Build specific stage
docker build --target build -t moonx-backend:build .
```

### Run Containers

```bash
# Run development container
docker run -p 3001:3001 -v $(pwd):/app -v /app/node_modules --env-file .env moonx-backend:dev

# Run production container
docker run -p 3001:3001 --env-file .env moonx-backend:prod

# Run with custom port
docker run -p 3002:3001 --env-file .env -e PORT=3001 moonx-backend:prod
```

### Container Management

```bash
# List running containers
docker ps

# Stop container
docker stop moonx-backend-dev

# Remove container
docker rm moonx-backend-dev

# View container logs
docker logs moonx-backend-dev

# Execute command trong container
docker exec -it moonx-backend-dev sh

# View container stats
docker stats moonx-backend-dev
```

## 🏗️ Multi-stage Build Explained

### Stages:

1. **base**: Shared base với pnpm và dependencies
2. **development**: Hot reload development environment
3. **build**: Build application cho production
4. **production**: Minimal production image

### Stage Targets:

```bash
# Development với hot reload
docker build --target development -t moonx-backend:dev .

# Build stage only (for CI/CD)
docker build --target build -t moonx-backend:build .

# Production với optimized size
docker build --target production -t moonx-backend:prod .
```

## 🔐 Environment Variables

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

**Required variables:**
```env
# Server
PORT=3001
HOST=0.0.0.0

# RPC URLs
BASE_RPC_URL=https://mainnet.base.org

# Contract Addresses
MOONX_BASE_CONTRACT_ADDRESS=0xd8b3479C0815D0FFf94343282FC9f34C5e8E7630
```

## 📊 Health Checks

Container có built-in health check:

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' moonx-backend-prod

# View health check logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' moonx-backend-prod
```

## 🧪 Testing trong Docker

```bash
# Test endpoints
docker exec -it moonx-backend-dev curl http://localhost:3001/health

# Test với external curl
curl http://localhost:3001/health
curl http://localhost:3001/api/networks
```

## 🔍 Debugging

### View logs real-time:
```bash
docker-compose --profile dev logs -f moonx-backend-dev
```

### Access container shell:
```bash
docker exec -it moonx-backend-dev sh
```

### Check processes trong container:
```bash
docker exec -it moonx-backend-dev ps aux
```

### View port mapping:
```bash
docker port moonx-backend-dev
```

## 🚀 Deployment

### Build và push image:

```bash
# Build production image
docker build --target production -t your-registry/moonx-backend:latest .

# Tag version
docker tag your-registry/moonx-backend:latest your-registry/moonx-backend:v1.0.0

# Push to registry
docker push your-registry/moonx-backend:latest
docker push your-registry/moonx-backend:v1.0.0
```

### Deploy với docker-compose:

```bash
# Production deployment
docker-compose --profile prod up -d --build

# Scale if needed
docker-compose --profile prod up -d --scale moonx-backend-prod=2
```

## 📝 Best Practices

1. **Security**: Container runs với non-root user
2. **Caching**: Multi-stage build optimizes layer caching
3. **Size**: Production image minimized với alpine base
4. **Health**: Built-in health checks cho monitoring
5. **Logs**: Proper logging cho debugging
6. **Env**: Environment variables cho configuration

## 🐛 Troubleshooting

### Port already in use:
```bash
# Kill process using port 3001
sudo lsof -i :3001
sudo kill -9 <PID>

# Use different port
docker run -p 3002:3001 --env-file .env moonx-backend:prod
```

### Permission denied:
```bash
# Fix file permissions
sudo chown -R $USER:$USER .

# Run với proper permissions
docker run --user $(id -u):$(id -g) ...
```

### Container won't start:
```bash
# Check logs
docker logs moonx-backend-dev

# Check environment
docker exec -it moonx-backend-dev env

# Verify .env file
cat .env
```