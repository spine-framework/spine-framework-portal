# Git Subtree Updates Guide

This repo uses git subtree to pull the Customer Portal app from the main Spine Framework development repository (`spine-ia`).

## Repository Structure

```
spine-framework-portal/
├── custom/apps/customer-portal/    # Subtree from spine-ia/custom/apps/customer-portal
├── LICENSE.md                      # License file
├── README.md                       # Documentation
├── package.json                    # NPM package configuration
└── SUBTREE_UPDATES.md              # This file
```

## Initial Setup

The repo was created with:

```bash
# Initialize repo
git init
git add LICENSE.md
git commit -m "Add Spine Framework Internal Use License"

# Add remote and subtree
git remote add spine-ia /path/to/spine-ia
git subtree add --prefix=custom/apps/customer-portal spine-ia main --squash
```

## Updating from Source

When the Customer Portal app is updated in `spine-ia`, pull changes to this repo:

```bash
# Pull latest changes from spine-ia
git subtree pull --prefix=custom/apps/customer-portal spine-ia main --squash
```

## Pushing Changes to Source

**DO NOT push changes from this repo back to spine-ia.**

All development should happen in the `spine-ia` repository. This repo is for distribution only.

## Publishing Updates

After updating from source:

1. **Update version** in `package.json` if needed
2. **Update changelog** in `README.md`
3. **Test the changes** locally
4. **Commit and push** to GitHub
5. **Publish to NPM**:
   ```bash
   npm publish
   ```

## Version Management

- Follow semantic versioning (major.minor.patch)
- Update version in `package.json` before publishing
- Document breaking changes in README.md
- Tag releases in GitHub: `git tag v1.0.0 && git push --tags`

## Troubleshooting

### Subtree Pull Conflicts

If subtree pull fails due to conflicts:

```bash
# Reset subtree to clean state
git rm -rf custom/apps/customer-portal
git commit -m "Remove subtree"

# Re-add subtree
git subtree add --prefix=custom/apps/customer-portal spine-ia main --squash
```

### Missing Remote

If the spine-ia remote is missing:

```bash
git remote add spine-ia /path/to/spine-ia
```

### Check Subtree Status

```bash
# Show subtree information
git subtree split --prefix=custom/apps/customer-portal --onto=spine-ia/main
```

## Workflow Summary

1. **Development**: Happens in `spine-ia/custom/apps/customer-portal`
2. **Distribution**: Pull changes to this repo via subtree
3. **Publishing**: Update version, commit, push to GitHub, publish to NPM
4. **Consumption**: Users install via `npm install spine-framework-portal`

This ensures a single source of truth while providing clean distribution packages.
