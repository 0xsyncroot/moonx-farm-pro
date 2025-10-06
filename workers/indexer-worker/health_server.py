"""
Health Check HTTP Server for MoonX Indexer Worker

Provides HTTP endpoints for health monitoring and metrics,
compatible with Kubernetes liveness and readiness probes.
"""

import asyncio
from typing import Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import uvicorn
import structlog
from contextlib import asynccontextmanager

from main import IndexerWorker


logger = structlog.get_logger()


class HealthServer:
    """HTTP server for health checks and monitoring."""
    
    def __init__(self, worker: IndexerWorker, port: int = 8080):
        self.worker = worker
        self.port = port
        self.app = FastAPI(
            title="MoonX Indexer Worker Health API",
            description="Health check and monitoring endpoints",
            version="1.0.0"
        )
        self._setup_routes()
    
    def _setup_routes(self):
        """Setup HTTP routes."""
        
        @self.app.get("/health", response_class=JSONResponse)
        async def health_check():
            """Main health check endpoint."""
            try:
                health_status = await self.worker.health_check()
                
                status_code = 200 if health_status.get("status") == "healthy" else 503
                
                return JSONResponse(
                    content=health_status,
                    status_code=status_code
                )
            except Exception as e:
                logger.error("Health check failed", error=str(e))
                raise HTTPException(
                    status_code=503,
                    detail={"status": "unhealthy", "error": str(e)}
                )
        
        @self.app.get("/health/live", response_class=JSONResponse)
        async def liveness_probe():
            """Kubernetes liveness probe endpoint."""
            try:
                # Simple check - is the worker process running?
                if self.worker.is_running:
                    return JSONResponse(
                        content={"status": "alive", "timestamp": "2024-01-01T00:00:00Z"},
                        status_code=200
                    )
                else:
                    return JSONResponse(
                        content={"status": "not_running"},
                        status_code=503
                    )
            except Exception as e:
                logger.error("Liveness probe failed", error=str(e))
                raise HTTPException(status_code=503, detail=str(e))
        
        @self.app.get("/health/ready", response_class=JSONResponse)
        async def readiness_probe():
            """Kubernetes readiness probe endpoint."""
            try:
                # Check if all services are ready to handle requests
                health_status = await self.worker.health_check()
                
                # Consider ready if at least one chain service is healthy
                services = health_status.get("services", {})
                if services and any(
                    svc.get("status") == "healthy" 
                    for svc in services.values()
                ):
                    return JSONResponse(
                        content={"status": "ready", "services": len(services)},
                        status_code=200
                    )
                else:
                    return JSONResponse(
                        content={"status": "not_ready", "reason": "no_healthy_services"},
                        status_code=503
                    )
            except Exception as e:
                logger.error("Readiness probe failed", error=str(e))
                raise HTTPException(status_code=503, detail=str(e))
        
        @self.app.get("/metrics", response_class=JSONResponse)
        async def metrics():
            """Metrics endpoint for monitoring."""
            try:
                # Get basic metrics from worker
                metrics_data = {
                    "timestamp": "2024-01-01T00:00:00Z",
                    "worker_status": "running" if self.worker.is_running else "stopped",
                    "active_chains": len(self.worker.indexer_services),
                    "chains": {}
                }
                
                # Get metrics from each chain indexer
                for chain_id, indexer_service in self.worker.indexer_services.items():
                    try:
                        health = await indexer_service.health_check()
                        metrics_data["chains"][str(chain_id)] = {
                            "status": health.get("status"),
                            "latest_block": health.get("components", {}).get("blockchain", {}).get("latest_block"),
                            "chain_name": health.get("chain_name")
                        }
                    except Exception as e:
                        metrics_data["chains"][str(chain_id)] = {
                            "status": "error",
                            "error": str(e)
                        }
                
                return JSONResponse(content=metrics_data, status_code=200)
                
            except Exception as e:
                logger.error("Metrics endpoint failed", error=str(e))
                raise HTTPException(status_code=500, detail=str(e))
        
        @self.app.get("/", response_class=JSONResponse)
        async def root():
            """Root endpoint with basic info."""
            return JSONResponse(content={
                "service": "MoonX Indexer Worker",
                "version": "1.0.0",
                "status": "running" if self.worker.is_running else "stopped",
                "endpoints": {
                    "health": "/health",
                    "liveness": "/health/live",
                    "readiness": "/health/ready",
                    "metrics": "/metrics"
                }
            })
    
    async def start(self):
        """Start the health server."""
        config = uvicorn.Config(
            self.app,
            host="0.0.0.0",
            port=self.port,
            log_level="info",
            access_log=False
        )
        server = uvicorn.Server(config)
        
        logger.info("Starting health server", port=self.port)
        await server.serve()
    
    def run_sync(self):
        """Run the health server synchronously."""
        uvicorn.run(
            self.app,
            host="0.0.0.0",
            port=self.port,
            log_level="info",
            access_log=False
        )


async def start_health_server_with_worker():
    """Start both the worker and health server together."""
    worker = IndexerWorker()
    health_server = HealthServer(worker)
    
    # Start worker and health server concurrently
    worker_task = asyncio.create_task(worker.start())
    health_task = asyncio.create_task(health_server.start())
    
    try:
        await asyncio.gather(worker_task, health_task)
    except Exception as e:
        logger.error("Failed to start worker with health server", error=str(e))
        await worker.stop()
        raise


if __name__ == "__main__":
    # Run health server with worker
    asyncio.run(start_health_server_with_worker())