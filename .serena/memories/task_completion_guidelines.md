# MoonX Swap - Task Completion Guidelines

## When a Task is Completed

### 1. Build Verification
Always verify that the project builds successfully after making changes:

```bash
# Backend build check
cd swap-backend
pnpm run build

# Frontend build check  
cd swap-ui
pnpm run build
```

### 2. Type Checking
Ensure TypeScript compilation passes without errors:

```bash
# Backend type checking (via build)
cd swap-backend && pnpm build

# Frontend type checking
cd swap-ui && pnpm type-check
```

### 3. Linting
Run linting to ensure code style compliance:

```bash
# Frontend linting (Backend has no specific linter configured)
cd swap-ui && pnpm lint
```

### 4. Development Server Testing
Test that development servers start without errors:

```bash
# Test backend development server
cd swap-backend && pnpm dev  # Should start without errors

# Test frontend development server  
cd swap-ui && pnpm dev       # Should start without errors
```

### 5. Functionality Verification
- **API Endpoints**: Test that modified API endpoints return expected responses
- **UI Components**: Verify that UI changes work as expected
- **Integration**: Ensure frontend-backend integration still works
- **Blockchain Integration**: Test that contract interactions work properly

## Quality Standards

### Code Quality
- **No TypeScript errors** - Must compile cleanly
- **Follow established patterns** - Match existing code structure
- **Proper error handling** - No silent failures
- **Type safety** - Full TypeScript typing
- **Clean imports** - Remove unused imports

### Performance Standards
- **Build time** - Should not significantly increase build time
- **Runtime performance** - No performance regressions
- **Bundle size** - Frontend bundles should not grow unnecessarily

### Security Standards
- **Input validation** - Validate all user inputs
- **Private key security** - Never expose or transmit private keys
- **Environment variables** - Use env vars instead of hardcoded values
- **Dependencies** - No unnecessary or insecure dependencies

## Testing Approach
Since the project emphasizes real integrations over mocking:

### Manual Testing Requirements
- **API functionality** - Test actual API responses
- **Blockchain integration** - Test with real contract interactions
- **UI functionality** - Test user interactions and flows
- **Error scenarios** - Test error handling and edge cases

### Integration Testing
- **Backend ↔ Blockchain** - Verify contract interactions
- **Frontend ↔ Backend** - Test API communication
- **End-to-end flows** - Complete user workflows

## Documentation Updates
After completing tasks:

### Code Documentation
- **Update inline comments** for complex logic
- **Update type definitions** if interfaces change
- **Document new API endpoints** with exact inputs/outputs

### Project Documentation
- **Update README.md** if new features are added
- **Update configuration docs** if setup changes
- **Update API documentation** for endpoint changes

## Pre-Commit Checklist
Before marking a task as complete:

- [ ] Code builds successfully (both backend and frontend)
- [ ] TypeScript compilation passes without errors
- [ ] ESLint passes (frontend)
- [ ] Development servers start without errors
- [ ] Functionality works as expected
- [ ] No new TypeScript errors introduced
- [ ] Code follows established patterns and conventions
- [ ] Error handling is properly implemented
- [ ] Security best practices are followed
- [ ] Documentation is updated if needed
- [ ] No debugging code (console.log, etc.) left in production code

## Error Resolution
If build or type checking fails:

1. **Read error messages carefully** - TypeScript errors are usually descriptive
2. **Check import statements** - Ensure correct imports and exports
3. **Verify type definitions** - Check that types match expected interfaces
4. **Review recent changes** - Identify what might have caused the issue
5. **Check configuration files** - Ensure tsconfig.json, package.json are correct
6. **Clean and rebuild** - Sometimes helps with cached build issues

## Common Issues and Solutions

### Build Failures
- Check for missing dependencies (`pnpm install`)
- Verify TypeScript configuration
- Check for syntax errors

### Type Errors
- Review type definitions in `/types` directories
- Check import/export statements
- Verify interface compatibility

### Runtime Errors
- Check environment variables are set
- Verify API endpoints are accessible
- Check blockchain network connectivity

### Performance Issues
- Review bundle analysis (frontend)
- Check for unnecessary re-renders
- Optimize API calls and blockchain interactions