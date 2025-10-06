FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy requirements files
COPY requirements*.txt ./

# Install Python dependencies with fallback options
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    (pip install --no-cache-dir -r requirements.txt || \
     pip install --no-cache-dir -r requirements-stable.txt || \
     pip install --no-cache-dir -r requirements-minimal.txt)

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash --uid 1001 app && \
    chown -R app:app /app && \
    chmod +x main.py

# Create directories for logs and data
RUN mkdir -p /app/logs /app/data && \
    chown -R app:app /app/logs /app/data

# Switch to non-root user
USER app

# Health check using the built-in health command
HEALTHCHECK --interval=60s --timeout=30s --start-period=30s --retries=3 \
    CMD python main.py health || exit 1

# Add labels for better container management
LABEL maintainer="MoonX Team" \
      description="MoonX Coin Indexer Worker" \
      version="1.0.0" \
      component="indexer-worker"

# Environment variables for production
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MOONX_COIN_LOG_LEVEL=INFO \
    MOONX_COIN_LOG_FORMAT=json

# Volumes for persistent data
VOLUME ["/app/logs", "/app/data"]

# Signal handling for graceful shutdown
STOPSIGNAL SIGTERM

# Default command with better signal handling
CMD ["python", "-u", "main.py", "start"]
