# Deployment Guide

This guide covers setting up GitHub repositories and publishing to NPM for spine-framework-portal.

## GitHub Setup

### 1. Create GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository:
   - **Repository name**: `spine-framework-portal`
   - **Description**: `Self-service portal for customers to access tickets, knowledge base, courses, and community built on Spine Framework`
   - **Visibility**: Public
   - **Don't initialize** with README, license, or .gitignore (we already have these)

### 2. Push to GitHub

```bash
# Add GitHub remote (replace with your GitHub URL)
git remote add origin https://github.com/spine-framework/spine-framework-portal.git

# Push to GitHub
git push -u origin main

# Push all tags
git push --tags
```

### 3. Configure GitHub Repository

In GitHub repository settings:

1. **Repository Settings → General**:
   - Set description: "Self-service portal for customers to access tickets, knowledge base, courses, and community built on Spine Framework"
   - Add website URL: "https://spine-framework.com"
   - Enable "Automatically delete head branches"

2. **Repository Settings → Branches**:
   - Set main branch as protected (optional)
   - Require pull request reviews (optional)

3. **Repository Settings → Integrations & Services**:
   - Enable GitHub Actions for CI/CD (optional)

## NPM Publishing

### 1. Prepare for Publishing

```bash
# Verify package.json
cat package.json

# Check if you're logged into NPM
npm whoami

# If not logged in:
npm login
```

### 2. Publish to NPM

```bash
# Dry run to test
npm publish --dry-run

# If dry run succeeds, publish
npm publish
```

### 3. Verify Publication

```bash
# Check if package is available
npm view spine-framework-portal

# Install test
npm install spine-framework-portal
```

## Version Management

### Semantic Versioning

- **Major (X.0.0)**: Breaking changes
- **Minor (0.X.0)**: New features, backward compatible
- **Patch (0.0.X)**: Bug fixes, documentation

### Release Process

1. **Update version** in `package.json`:
   ```bash
   npm version patch  # or minor, major
   ```

2. **Update changelog** in `README.md`

3. **Commit and push**:
   ```bash
   git add package.json README.md
   git commit -m "Release v1.0.1"
   git push origin main
   ```

4. **Publish to NPM**:
   ```bash
   npm publish
   ```

5. **Create GitHub release**:
   ```bash
   git tag v1.0.1
   git push --tags
   ```

## CI/CD Pipeline (Optional)

### GitHub Actions Workflow

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to NPM

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
          
      - name: Publish to NPM
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Setup NPM Token

1. Go to [NPM](https://www.npmjs.com)
2. Account Settings → Access Tokens → Generate New Token
3. Select "Automation" level
4. Add token to GitHub repository secrets as `NPM_TOKEN`

## Post-Setup Checklist

- [ ] GitHub repository created and pushed
- [ ] NPM package published successfully
- [ ] Documentation links updated
- [ ] CI/CD pipeline configured (optional)
- [ ] GitHub releases configured
- [ ] Repository settings configured

## Usage Examples

After publishing, users can install and use:

```bash
# Install
npm install spine-framework-portal

# Use in Spine Framework
npx spine install-app customer-portal
```

## Troubleshooting

### NPM Publishing Issues

**Error: "403 Forbidden"**
- Check if you're logged in: `npm whoami`
- Verify package name availability
- Check NPM token permissions

**Error: "Package already exists"**
- Package name is taken, choose a different name
- Or check if you own the existing package

### GitHub Push Issues

**Error: "Permission denied"**
- Check GitHub authentication: `ssh -T git@github.com`
- Verify repository URL
- Check if you have push permissions

## Support

- **Documentation**: See [README.md](README.md)
- **Issues**: Create GitHub issues
- **Community**: Spine Framework community forums
- **License**: See [LICENSE.md](LICENSE.md)
