# Testing Guide

## Overview

This project uses **Vitest** for testing with automatic test discovery. Tests are automatically run on commits (pre-commit hooks) and in CI/CD (GitHub Actions).

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Specific Test File
```bash
npm test -- lib/db/budgets.test.ts
```

### With Coverage
```bash
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory:
- **HTML Report**: Open `coverage/index.html` in your browser
- **Text Summary**: Displayed in terminal
- **JSON/LCOV**: For CI/CD integration

### Test UI (Interactive)
```bash
npm run test:ui
```

## Test Structure

Tests are automatically discovered by Vitest:
- Pattern: `**/*.test.ts` and `**/*.test.tsx`
- Location: Anywhere in the project (except `node_modules`, `.next`, `src-tauri`)

### Current Test Files

1. **`lib/db/abstraction.test.ts`** - Database abstraction layer tests ✅
2. **`lib/db/transactions.test.ts`** - Transaction operations tests ✅
3. **`lib/db/budgets.test.ts`** - Budget operations tests ⚠️ (needs fixes)

## Pre-commit Hooks

Husky automatically runs tests before each commit:

1. **Linter** - Checks code quality with ESLint
2. **Tests** - Runs all unit tests

If either step fails, the commit is blocked.

### Bypassing Hooks (Emergency Only)

```bash
git commit --no-verify -m "Emergency commit message"
```

⚠️ **Warning**: Only use `--no-verify` when absolutely necessary.

## CI/CD (GitHub Actions)

Tests run automatically on:
- Push to `main`, `develop`, or `master` branches
- Pull requests to `main`, `develop`, or `master` branches

### What Runs in CI

1. ✅ Code checkout
2. ✅ Node.js 20.x setup
3. ✅ Dependency installation (`npm ci`)
4. ✅ Linter (`npm run lint`)
5. ✅ All tests (`npm test`)
6. ✅ Coverage generation (`npm run test:coverage`)
7. ✅ Coverage upload to Codecov (optional)

### Viewing CI Results

- Go to your GitHub repository
- Click on "Actions" tab
- View the "Tests" workflow runs

## Test Coverage

Coverage is configured to exclude:
- `node_modules/`
- `.next/`
- `src-tauri/`
- Test files themselves
- Type definitions
- Config files

### Coverage Goals

While no strict minimum is enforced, aim for:
- **Critical paths**: 80%+ coverage
- **New features**: Tests for all new code
- **Bug fixes**: Tests that prevent regression

## Writing Tests

### Test File Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  it('should do something', () => {
    // Test implementation
    expect(result).toBe(expected);
  });
});
```

### Best Practices

1. **Isolate tests** - Each test should be independent
2. **Clean up** - Remove test data after each test
3. **Use descriptive names** - Test names should explain what they test
4. **Test edge cases** - Don't just test happy paths
5. **Mock external dependencies** - Use `vi.mock()` for database, APIs, etc.

## Troubleshooting

### Tests Fail Locally But Pass in CI

- Check Node.js version (CI uses 20.x)
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear test database files in `data/test/`

### Pre-commit Hook Not Running

```bash
# Reinstall husky
npm run prepare

# Make hooks executable (Linux/Mac)
chmod +x .husky/pre-commit
```

### Coverage Not Generating

Ensure `@vitest/coverage-v8` is installed:
```bash
npm install --save-dev @vitest/coverage-v8
```

## Next Steps

- [ ] Fix remaining budget test failures
- [ ] Add integration tests for API routes
- [ ] Add E2E tests for critical user flows
- [ ] Set up coverage thresholds
- [ ] Add test performance monitoring

