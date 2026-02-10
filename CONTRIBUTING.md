# Contributing to SyncKit

Thank you for your interest in contributing to SyncKit! 🎉

We welcome contributions from everyone, whether you're fixing a typo, adding a feature, or improving documentation.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Ways to Contribute](#ways-to-contribute)
3. [Getting Started](#getting-started)
4. [Development Workflow](#development-workflow)
5. [Submitting Changes](#submitting-changes)
6. [Style Guidelines](#style-guidelines)
7. [Community & Recognition](#community--recognition)

---

## Code of Conduct

**Be respectful, be kind, be collaborative.**

We're committed to providing a welcoming and inclusive environment. By participating, you agree to:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards other community members

**Unacceptable behavior includes:**
- Harassment, trolling, or personal attacks
- Publishing others' private information
- Spam or off-topic discussions
- Any conduct that would be inappropriate in a professional setting

**Enforcement:** Violations will result in a warning, temporary ban, or permanent ban depending on severity.

---

## Ways to Contribute

### 🐛 Bug Reports

Found a bug? Help us fix it!

**Before submitting:**
1. Check [existing issues](https://github.com/Dancode-188/synckit/issues) to avoid duplicates
2. Try to reproduce on latest version
3. Gather details (error message, browser/Node version, minimal repro)

**Submit a bug report:**
1. Go to [Issues](https://github.com/Dancode-188/synckit/issues/new)
2. Select "Bug Report" template
3. Fill in all sections
4. Add label: `bug`

**What makes a good bug report:**
- Clear, specific title
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, browser, Node version)
- Error messages / stack traces
- Minimal code example

### ✨ Feature Requests

Have an idea? We'd love to hear it!

**Before requesting:**
1. Check [roadmap](ROADMAP.md) and [existing issues](https://github.com/Dancode-188/synckit/issues?q=is%3Aissue+label%3Aenhancement)
2. Consider if it fits SyncKit's philosophy (simple, fast, offline-first)
3. Think about backward compatibility

**Submit a feature request:**
1. Go to [Issues](https://github.com/Dancode-188/synckit/issues/new)
2. Select "Feature Request" template
3. Explain use case and motivation
4. Add label: `enhancement`

### 📚 Documentation

Documentation improvements are always welcome!

**Types of contributions:**
- Fix typos or grammar
- Clarify confusing sections
- Add examples or diagrams
- Translate docs (coming soon)
- Improve code comments

**How to contribute:**
- Small changes: Edit directly on GitHub (click "Edit this file")
- Larger changes: Follow [development workflow](#development-workflow)

### 🧪 Tests

Help us improve test coverage!

**Areas needing tests:**
- Edge cases in conflict resolution
- Network failure scenarios
- Cross-browser compatibility
- Performance benchmarks

**See:** [Testing Guide](docs/guides/testing.md)

### 🌐 Multi-Language Servers

Python, Go, and C# server implementations are complete and production-ready in v0.3.0. We welcome contributions to the **Rust server**:

- ✅ **Python Server** - Complete (FastAPI, JWT, PostgreSQL, Redis)
- ✅ **Go Server** - Complete (gorilla/websocket, JWT, PostgreSQL, Redis)
- ✅ **C# Server** - Complete (ASP.NET Core, JWT, PostgreSQL, Redis)
- 🚧 **Rust Server** - Contributions welcome!

**Requirements for Rust server:**
- WebSocket support for real-time sync
- JWT authentication
- Database integration (PostgreSQL)
- Match TypeScript/Python/Go server behavior

**See:** [Server Architecture](docs/architecture/ARCHITECTURE.md)

### 💡 Code Contributions

Ready to write code? Awesome!

**Good first issues:**
- Look for [`good-first-issue`](https://github.com/Dancode-188/synckit/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) label
- Start with documentation or tests
- Fix bugs before adding features

**How to contribute:**
1. Find or create an issue
2. Comment "I'd like to work on this"
3. Wait for confirmation (avoid duplicate work)
4. Follow [development workflow](#development-workflow)

---

## Getting Started

### Prerequisites

**Required:**
- Node.js 18+ or Bun 1.0+
- Rust 1.70+ (for core development)
- Git

**Recommended:**
- VS Code with Rust Analyzer extension
- PostgreSQL (for server development)

### Setup Instructions

```bash
# 1. Fork the repository on GitHub
#    Click "Fork" button on https://github.com/Dancode-188/synckit

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/synckit.git
cd synckit

# 3. Add upstream remote
git remote add upstream https://github.com/Dancode-188/synckit.git

# 4. Install dependencies
npm install  # Installs SDK and example workspaces
# or
bun install

# 5. Install server dependencies (not a workspace)
cd server/typescript
bun install
cd ../..

# 6. Build the core (WASM) - Optional, pre-built WASM included
# Only needed if modifying Rust code
cd core
bash scripts/build-wasm.sh  # or scripts/build-wasm.ps1 on Windows
cd ..

# 7. Build the SDK
npm run build

# 8. Verify setup
npm test
```

### Verify Setup

```bash
# Run all tests (core + SDK + server)
npm test

# Or run specific test suites:
npm test -w sdk              # SDK tests only
cd core && cargo test         # Core Rust tests
cd server/typescript && bun test  # Server tests

# Run linter
npm run lint

# Type check
npm run type-check
```

### Finding Issues to Work On

**Start here:**
1. [`good-first-issue`](https://github.com/Dancode-188/synckit/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) - Beginner-friendly
2. [`help-wanted`](https://github.com/Dancode-188/synckit/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) - We need help!
3. [`documentation`](https://github.com/Dancode-188/synckit/issues?q=is%3Aissue+is%3Aopen+label%3Adocumentation) - Doc improvements
4. [`bug`](https://github.com/Dancode-188/synckit/issues?q=is%3Aissue+is%3Aopen+label%3Abug) - Bug fixes

**Comment on the issue** before starting work to avoid duplication!

---

## Development Workflow

### Branch Naming

Use descriptive branch names:

```bash
# Features
feature/add-vue-adapter
feature/sqlite-storage

# Bug fixes
fix/conflict-resolution-edge-case
fix/memory-leak-in-subscription

# Documentation
docs/improve-getting-started
docs/add-testing-examples

# Tests
test/add-chaos-tests
test/improve-property-tests
```

### Development Process

```bash
# 1. Sync with upstream
git fetch upstream
git checkout main
git merge upstream/main

# 2. Create feature branch
git checkout -b feature/your-feature-name

# 3. Make changes
# Edit files, write tests, update docs

# 4. Run tests
npm test

# 5. Run linter
npm run lint

# 6. Commit changes (see commit conventions below)
git add .
git commit -m "feat: add Vue adapter"

# 7. Push to your fork
git push origin feature/your-feature-name

# 8. Open pull request on GitHub
```

### Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Format
<type>(<scope>): <subject>

# Types
feat:     New feature
fix:      Bug fix
docs:     Documentation only
style:    Code style (formatting, semicolons, etc.)
refactor: Code refactoring (no functional changes)
perf:     Performance improvement
test:     Add or update tests
chore:    Maintenance (dependencies, build, etc.)

# Examples
feat(sdk): add Vue composables
fix(core): resolve conflict resolution edge case
docs(guides): improve offline-first guide
test(sdk): add property-based tests for convergence
perf(wasm): optimize delta computation
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
cd core && cargo test        # Rust tests
cd sdk && npm test           # SDK tests
cd server/typescript && bun test  # Server tests

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run type-check

# Run all checks
npm run check
```

---

## Submitting Changes

### Pull Request Process

1. **Ensure all tests pass** - `npm test`
2. **Update documentation** - If changing APIs
3. **Add tests** - For new features or bug fixes
4. **Run linter** - `npm run lint`
5. **Write clear PR description** - What, why, how

### Pull Request Template

```markdown
## Description
Brief description of changes

## Motivation
Why is this change needed?

## Changes
- Added X
- Fixed Y
- Updated Z

## Testing
How did you test this?

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Tests pass locally
- [ ] Added/updated tests
- [ ] Updated documentation
- [ ] Followed code style
- [ ] PR title follows conventions
```

### Review Process

**Timeline:**
- Initial feedback: Within 48 hours
- Full review: Within 1 week
- Merge: After approval + CI passes

**What we look for:**
- ✅ Code quality and readability
- ✅ Test coverage
- ✅ Documentation updates
- ✅ Backward compatibility
- ✅ Performance impact

**If changes requested:**
1. Make requested changes
2. Push to same branch
3. Reply to review comments
4. Re-request review

---

## Style Guidelines

### TypeScript Style

```typescript
// ✅ Good
export async function updateDocument<T>(
  id: string,
  updates: Partial<T>
): Promise<void> {
  const doc = sync.document<T>(id)
  await doc.update(updates)
}

// ❌ Bad
export async function updateDocument(id, updates) {
  var doc = sync.document(id)
  await doc.update(updates)
}
```

**Rules:**
- Use `const` and `let`, never `var`
- Explicit types for function parameters and returns
- Use async/await over promises
- Use arrow functions for callbacks
- Use template literals for strings

### Rust Style

```rust
// ✅ Good
pub fn merge_documents(
    local: &Document,
    remote: &Document,
) -> Result<Document, MergeError> {
    let merged = Document::new();
    // ...
    Ok(merged)
}

// ❌ Bad
pub fn merge_documents(local: &Document, remote: &Document) -> Document {
    let mut merged = Document::new();
    // ...
    merged
}
```

**Rules:**
- Follow `rustfmt` defaults
- Use `Result<T, E>` for errors
- Document public APIs with `///`
- Keep functions small (<50 lines)

### Documentation Style

````markdown
<!-- ✅ Good -->
## Quick Start

Install SyncKit:

```bash
npm install @synckit-js/sdk
```

Initialize in your app:

```typescript
const sync = new SyncKit()
const doc = sync.document<Todo>('todo-1')
```

<!-- ❌ Bad -->
## quick start

install it
npm install @synckit-js/sdk

then use it
const sync = new SyncKit()
````

**Rules:**
- Use proper markdown formatting
- Include code examples
- Use headers for structure
- Keep paragraphs short (<4 lines)

---

## Community & Recognition

### Getting Help

**Stuck?** We're here to help!

- **[GitHub Discussions](https://github.com/Dancode-188/synckit/discussions)** - Q&A and community chat
- **[Issues](https://github.com/Dancode-188/synckit/issues)** - Bug reports and features

**Mentorship:**
- First-time contributors get extra support
- Tag issues with `good-first-issue` for guidance
- Ask questions in issue comments

### Recognition

**Contributors are recognized:**
- ✅ Listed in AUTHORS file
- ✅ Mentioned in release notes
- ✅ Thanked in project README

**Top contributors:**
- Featured on project homepage
- Invited to contributor calls
- Early access to new features

### Community Calls

**Monthly contributor calls:**
- First Wednesday of each month
- Review progress, discuss roadmap
- Q&A with maintainers

**Details:** Announced in [GitHub Discussions](https://github.com/Dancode-188/synckit/discussions)

---

## Questions?

**Still have questions?** Reach out:

- 💬 [GitHub Discussions](https://github.com/Dancode-188/synckit/discussions)
- 📧 [Email](mailto:danbitengo@gmail.com)
- 🐛 [Open an Issue](https://github.com/Dancode-188/synckit/issues)

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

<div align="center">

**Thank you for contributing to SyncKit! 🎉**

[View Issues](https://github.com/Dancode-188/synckit/issues) • [View Pull Requests](https://github.com/Dancode-188/synckit/pulls) • [Back to README](README.md)

</div>
