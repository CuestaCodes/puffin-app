# CI/CD Workflows

## Test Workflow

The `test.yml` workflow runs automatically on:
- Push to `main`, `develop`, or `master` branches
- Pull requests to `main`, `develop`, or `master` branches

### What it does:
1. ✅ Checks out the code
2. ✅ Sets up Node.js 20.x
3. ✅ Installs dependencies with `npm ci`
4. ✅ Runs linter (`npm run lint`)
5. ✅ Runs all tests (`npm test`)
6. ✅ Generates test coverage (`npm run test:coverage`)
7. ✅ Uploads coverage to Codecov (optional, requires token)

### Coverage Reports

Coverage reports are generated in the `coverage/` directory with:
- Text summary in terminal
- HTML report in `coverage/index.html`
- JSON report for CI/CD
- LCOV report for coverage services

To view coverage locally:
```bash
npm run test:coverage
# Then open coverage/index.html in your browser
```

