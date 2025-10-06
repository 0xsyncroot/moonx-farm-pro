# Test Plan for Uniswap V4 Swap Fixes

## 🧪 Testing Strategy

### 1. **Basic V4 Swap Test**
```bash
# Test case: ERC20 → ERC20 swap
# Expected: Should complete without revert
# Previous: Failed with "Invalid output delta"
```

### 2. **Hook Distribution Test**  
```bash
# Test case: Swap with hook that auto-distributes tokens
# Expected: Should handle gracefully without trying to take already distributed tokens
# Previous: May have had conflicts with hook behavior
```

### 3. **Delta Direction Test**
```bash
# Test case: Verify both positive and negative deltas are handled
# Expected: Both scenarios should work correctly
# Previous: Only positive deltas worked
```

### 4. **Faucet Environment Test**
```bash
# Test case: Run swap in faucet environment with special hooks
# Expected: Should work even with non-standard hook behavior  
# Previous: Failed due to strict validation
```

## 🔍 Debug Commands

### Check Transaction Trace
```bash
# Re-run the failing transaction after fixes
cast run <TRANSACTION_HASH> --trace
```

### Verify Hook Behavior
```bash
# Check if hooks are distributing tokens correctly
cast call <POOL_MANAGER> "extsload(bytes32)" <POOL_STATE_SLOT>
```

### Validate Output Amounts
```bash
# Ensure actual output matches expected  
# Compare returned amount vs minOut vs hook distribution
```

## ✅ Expected Results After Fix

1. **No more "Invalid output delta" reverts**
2. **Proper handling of hook token distribution**
3. **Correct output amount reporting**
4. **Compatible with faucet environment hooks**

## 🚨 Monitor for Issues

- **Gas usage**: Check if fixes increase gas significantly
- **Hook compatibility**: Ensure works with various hook types
- **Edge cases**: Test with very small/large amounts
- **Multi-hop**: Test with complex routing if applicable 