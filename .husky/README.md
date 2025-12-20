# Git Hooks

This project uses [Husky](https://typicode.github.io/husky/) to manage Git hooks.

## Pre-commit Hook

The pre-commit hook automatically runs before each commit:

1. **Linter** - Runs ESLint to check code quality
2. **Tests** - Runs all unit tests to ensure nothing is broken

If either step fails, the commit is blocked. This ensures:
- ✅ No broken code is committed
- ✅ Code style is consistent
- ✅ All tests pass before committing

### Bypassing Hooks (Use Sparingly)

If you need to bypass hooks in an emergency:
```bash
git commit --no-verify -m "Emergency commit"
```

⚠️ **Warning**: Only use `--no-verify` when absolutely necessary. It defeats the purpose of automated checks.

### Disabling Hooks Temporarily

To disable hooks for a session:
```bash
export HUSKY=0
```

### Adding New Hooks

To add a new hook:
```bash
npx husky add .husky/hook-name "command to run"
```

