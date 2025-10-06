"""
Decimal utilities for proper price formatting and calculations.
Prevents scientific notation and ensures accurate decimal representation.
"""

from decimal import Decimal, getcontext, ROUND_DOWN
from typing import Union, Optional
import math

# Set high precision for accurate calculations
getcontext().prec = 50

class PriceFormatter:
    """Utility class for proper price formatting."""
    
    @staticmethod
    def format_price(value: Union[float, int, str, Decimal], max_decimals: int = 18) -> str:
        """
        Format price to avoid scientific notation.
        
        Args:
            value: Price value to format
            max_decimals: Maximum decimal places to keep
            
        Returns:
            String representation without scientific notation
        """
        try:
            if value is None or value == 0:
                return "0"
            
            # Convert to Decimal for precise calculation
            decimal_value = Decimal(str(value))
            
            # If value is too small, return "0"
            if abs(decimal_value) < Decimal(f"1e-{max_decimals}"):
                return "0"
            
            # Format without scientific notation
            # Remove trailing zeros and unnecessary decimal point
            formatted = format(decimal_value, f'.{max_decimals}f').rstrip('0').rstrip('.')
            
            # Ensure we don't return empty string
            if not formatted or formatted == '.':
                return "0"
                
            return formatted
            
        except (ValueError, TypeError, Exception):
            return "0"
    
    @staticmethod
    def calculate_price_from_reserves(
        reserve0: Union[str, int, float], 
        reserve1: Union[str, int, float],
        decimals0: int,
        decimals1: int
    ) -> tuple[str, str]:
        """
        Calculate prices from reserves with proper decimal handling.
        
        Args:
            reserve0: Reserve amount of token0
            reserve1: Reserve amount of token1
            decimals0: Token0 decimals
            decimals1: Token1 decimals
            
        Returns:
            Tuple of (price_token0_in_token1, price_token1_in_token0)
        """
        try:
            # Convert to Decimal for precise calculation
            res0 = Decimal(str(reserve0))
            res1 = Decimal(str(reserve1))
            
            if res0 == 0 or res1 == 0:
                return "0", "0"
            
            # Adjust for decimals
            decimal_diff = decimals1 - decimals0
            adjustment = Decimal(10) ** decimal_diff
            
            # Calculate prices: price0 = reserve1 / reserve0 * adjustment
            price_token0_in_token1 = (res1 / res0) * adjustment
            price_token1_in_token0 = (res0 / res1) / adjustment
            
            # Format prices
            price0_formatted = PriceFormatter.format_price(price_token0_in_token1)
            price1_formatted = PriceFormatter.format_price(price_token1_in_token0)
            
            return price0_formatted, price1_formatted
            
        except (ValueError, TypeError, ZeroDivisionError, Exception):
            return "0", "0"
    
    @staticmethod
    def calculate_price_from_sqrt_price(
        sqrt_price_x96: Union[str, int],
        decimals0: int,
        decimals1: int
    ) -> tuple[str, str]:
        """
        Calculate price from Uniswap V3 sqrt price with proper decimal handling.
        
        Args:
            sqrt_price_x96: Sqrt price in X96 format
            decimals0: Token0 decimals
            decimals1: Token1 decimals
            
        Returns:
            Tuple of (price_token0_in_token1, price_token1_in_token0)
        """
        try:
            # Convert sqrt_price_x96 to actual price
            sqrt_price = Decimal(str(sqrt_price_x96)) / (Decimal(2) ** 96)
            price = sqrt_price ** 2
            
            if price == 0:
                return "0", "0"
            
            # Adjust for token decimals
            decimal_adjustment = Decimal(10) ** (decimals1 - decimals0)
            adjusted_price = price * decimal_adjustment
            
            # Calculate both directions
            price_token0_in_token1 = adjusted_price
            price_token1_in_token0 = Decimal(1) / adjusted_price if adjusted_price != 0 else Decimal(0)
            
            # Format prices
            price0_formatted = PriceFormatter.format_price(price_token0_in_token1)
            price1_formatted = PriceFormatter.format_price(price_token1_in_token0)
            
            return price0_formatted, price1_formatted
            
        except (ValueError, TypeError, ZeroDivisionError, Exception):
            return "0", "0"
    
    @staticmethod
    def format_token_amount(amount: Union[str, int, float], decimals: int) -> str:
        """
        Format token amount with proper decimal adjustment.
        
        Args:
            amount: Raw token amount
            decimals: Token decimals
            
        Returns:
            Formatted amount string
        """
        try:
            if amount is None or amount == 0:
                return "0"
                
            # Convert to Decimal and adjust for decimals
            decimal_amount = Decimal(str(amount)) / (Decimal(10) ** decimals)
            
            return PriceFormatter.format_price(decimal_amount)
            
        except (ValueError, TypeError, Exception):
            return "0"

    @staticmethod
    def safe_divide(numerator: Union[str, int, float], denominator: Union[str, int, float]) -> str:
        """
        Safe division with proper error handling.
        
        Args:
            numerator: Numerator value
            denominator: Denominator value
            
        Returns:
            Division result as formatted string
        """
        try:
            num = Decimal(str(numerator))
            den = Decimal(str(denominator))
            
            if den == 0:
                return "0"
                
            result = num / den
            return PriceFormatter.format_price(result)
            
        except (ValueError, TypeError, ZeroDivisionError, Exception):
            return "0"

    @staticmethod 
    def is_valid_price(price_str: str) -> bool:
        """
        Check if price string is valid (not scientific notation, not infinity).
        
        Args:
            price_str: Price string to validate
            
        Returns:
            True if valid, False otherwise
        """
        try:
            if not price_str or price_str in ["0", "0.0"]:
                return True
                
            # Check for scientific notation
            if 'e' in price_str.lower() or 'E' in price_str:
                return False
                
            # Check if it's a valid decimal
            price_decimal = Decimal(price_str)
            
            # Check for infinity or NaN
            if not price_decimal.is_finite():
                return False
                
            return True
            
        except (ValueError, TypeError, Exception):
            return False


# Convenient functions for direct use
def format_price(value: Union[float, int, str, Decimal], max_decimals: int = 18) -> str:
    """Format price value to avoid scientific notation."""
    return PriceFormatter.format_price(value, max_decimals)

def calculate_price_from_reserves(reserve0, reserve1, decimals0: int, decimals1: int) -> tuple[str, str]:
    """Calculate prices from reserves."""
    return PriceFormatter.calculate_price_from_reserves(reserve0, reserve1, decimals0, decimals1)

def calculate_price_from_sqrt_price(sqrt_price_x96, decimals0: int, decimals1: int) -> tuple[str, str]:
    """Calculate price from sqrt price."""
    return PriceFormatter.calculate_price_from_sqrt_price(sqrt_price_x96, decimals0, decimals1)

def format_token_amount(amount, decimals: int) -> str:
    """Format token amount."""
    return PriceFormatter.format_token_amount(amount, decimals)

def safe_divide(numerator, denominator) -> str:
    """Safe division."""
    return PriceFormatter.safe_divide(numerator, denominator)

def is_valid_price(price_str: str) -> bool:
    """Check if price is valid."""
    return PriceFormatter.is_valid_price(price_str)