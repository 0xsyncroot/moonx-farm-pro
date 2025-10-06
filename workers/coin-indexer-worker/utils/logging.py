"""Logging configuration for MoonX Coin Indexer Worker."""

import structlog
import logging
import sys
from typing import List, Any


def configure_logging(log_level: str = "INFO", log_format: str = "json") -> None:
    """
    Configure structured logging for the application.
    
    Args:
        log_level: Log level (DEBUG, INFO, WARNING, ERROR)
        log_format: Output format ("json" or "console")
    """
    # Convert string level to int
    level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
    }
    
    numeric_level = level_map.get(log_level.upper(), logging.INFO)
    
    # Configure stdlib logging first
    logging.basicConfig(
        level=numeric_level,
        format="%(message)s",
        stream=sys.stdout
    )
    
    # Set levels for noisy libraries
    logging.getLogger("aiohttp").setLevel(logging.WARNING)
    logging.getLogger("web3").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("motor").setLevel(logging.WARNING)
    logging.getLogger("pymongo").setLevel(logging.WARNING)
    
    # Choose processors based on format
    processors: List[Any] = [
        structlog.stdlib.filter_by_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    
    if log_format == "console":
        # Human-readable console output with colors
        processors.extend([
            structlog.dev.ConsoleRenderer(colors=True)
        ])
    else:
        # JSON output for production
        processors.extend([
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer()
        ])
    
    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        context_class=dict,
        cache_logger_on_first_use=True,
    )
