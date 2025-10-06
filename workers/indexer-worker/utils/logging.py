"""
Logging utilities for MoonX Indexer Worker
"""

import structlog
import logging
import sys
from typing import Any, Dict


def configure_logging(log_level: str = "INFO", log_format: str = "json") -> None:
    """Configure structured logging for the application."""
    
    # Convert string level to logging constant
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    
    processors = [
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
    ]
    
    if log_format.lower() == "json":
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.extend([
            structlog.dev.ConsoleRenderer(colors=True),
        ])
    
    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(numeric_level),
        logger_factory=structlog.WriteLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=False,  # Allow reconfiguration
    )
    
    # Configure standard logging to work with structlog
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=numeric_level,
        force=True,  # Force reconfiguration
    )
    
    # Flush stdout to ensure immediate output
    sys.stdout.flush()


def get_logger(name: str = None) -> structlog.BoundLogger:
    """Get a configured logger instance."""
    if name:
        return structlog.get_logger(name)
    return structlog.get_logger()


def log_function_call(func):
    """Decorator to log function calls with parameters and results."""
    def wrapper(*args, **kwargs):
        logger = get_logger(func.__module__)
        
        logger.debug(
            "Function called",
            function=func.__name__,
            args_count=len(args),
            kwargs=list(kwargs.keys())
        )
        
        try:
            result = func(*args, **kwargs)
            logger.debug(
                "Function completed",
                function=func.__name__,
                success=True
            )
            return result
        except Exception as e:
            logger.error(
                "Function failed",
                function=func.__name__,
                error=str(e),
                error_type=type(e).__name__
            )
            raise
    
    return wrapper


def log_async_function_call(func):
    """Decorator to log async function calls with parameters and results."""
    async def wrapper(*args, **kwargs):
        logger = get_logger(func.__module__)
        
        logger.debug(
            "Async function called",
            function=func.__name__,
            args_count=len(args),
            kwargs=list(kwargs.keys())
        )
        
        try:
            result = await func(*args, **kwargs)
            logger.debug(
                "Async function completed",
                function=func.__name__,
                success=True
            )
            return result
        except Exception as e:
            logger.error(
                "Async function failed",
                function=func.__name__,
                error=str(e),
                error_type=type(e).__name__
            )
            raise
    
    return wrapper