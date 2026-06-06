# Spine Deployment

**Generated:** 2026-05-22  
**Purpose:** Complete audit of assembly and deployment processes for development and production

## Assembly Process

### Core Assembly Scripts
- `scripts/assemble-v2.sh` - **PRIMARY** - Main assembly orchestrator
- `scripts/assemble-v2-frontend.sh` - Frontend assembly
- `scripts/assemble-v2-functions.sh` - Netlify functions assembly
- `scripts/assemble-v2-custom.sh` - Custom code integration

### Assembly Support Files
- `scripts/build-manifest.sh` - Manifest generation for assembly
- `scripts/verify-integrity.sh` - Post-assembly integrity check
- `scripts/verify-v2-integrity.sh` - Core framework integrity verification
- `scripts/app-install-cli.ts` - CLI tool for app installation

### Assembly Configuration
- `v2-core/.spine-manifest.json` - Framework manifest for assembly
- `v2-core/cli/` - CLI tools for assembly operations
- `v2-core/cli/index.ts` - CLI entry point
- `v2-core/cli/context.ts` - CLI context management
- `v2-core/cli/env-loader.ts` - Environment loading for assembly

## Development Deployment

### Local Development Setup
- `netlify.toml` - **PRIMARY** - Netlify local development configuration
- `scripts/netlify-dev-wrapper.sh` - Local development server wrapper
- `vite.config.ts` - **REQUIRED** - Vite development server configuration
- `.env.example` - Development environment template

### Development Build Configuration
- `vite.config.d.ts` - Vite configuration types
- `tsconfig.json` - TypeScript development configuration
- `tsconfig.node.json` - Node.js TypeScript config
- `vitest.config.ts` - Testing configuration for development

### Development Server Files
- `v2-core/index.html` - Development HTML entry point
- `v2-core/src/main.tsx` - Frontend development entry
- `v2-core/src/` - Frontend source code
- `v2-core/functions/` - Netlify functions for development

## Production Build

### Build Configuration
- `vite.config.ts` - **PRIMARY** - Production build configuration
- `package.json` - Build scripts and dependencies
- `tailwind.config.ts` - CSS build configuration
- `postcss.config.js` - PostCSS build processing

### Build Output Targets
- `src/` - **GENERATED** - Assembled frontend output
- `functions/` - **GENERATED** - Assembled Netlify functions
- `v2-core/src/` - Core framework source (assembled into src/)
- `v2-custom/src/` - Custom source (assembled into src/)

### Build Verification
- `scripts/verify-integrity.sh` - Post-build verification
- `scripts/verify-v2-integrity.sh` - Framework-specific verification

## Production Deployment

### Netlify Deployment
- `netlify.toml` - **PRIMARY** - Production deployment configuration
- `.github/workflows/` - CI/CD deployment pipelines
- `.github/workflows/smoke-test.yml` - Deployment smoke tests
- `.github/workflows/unit-tests.yml` - Pre-deployment tests

### Deployment Configuration Files
- `package.json` - Deployment dependencies and scripts
- `v2-core/package.json` - Core framework deployment config
- `v2-core/.xenv.example` - Production environment template

### Deployment Artifacts
- `functions/` - **DEPLOYED** - Netlify functions
- `src/` - **DEPLOYED** - Frontend build output
- `v2-core/index.html` - Frontend entry point
- Build cache files ( TypeScript .tsbuildinfo files)

## Assembly Workflow Analysis

### Assembly Process Flow
1. **Pre-assembly**: Environment setup and dependency installation
2. **Core assembly**: `scripts/assemble-v2.sh` orchestrates all components
3. **Frontend assembly**: Combines v2-core and v2-custom frontend code
4. **Functions assembly**: Combines core and custom Netlify functions
5. **Custom integration**: Assembles tenant-specific customizations
6. **Post-assembly**: Verification and manifest generation

### Assembly Input Sources
- `v2-core/` - Core framework source code
- `v2-custom/` - Custom tenant overrides and extensions
- `functions/` - Individual function files
- `src/` - Frontend source files

### Assembly Output Structure
```
functions/          # Assembled Netlify functions
├── _shared/        # Shared function code
├── core functions  # From v2-core/functions/
└── custom functions # From v2-custom/functions/

src/                # Assembled frontend
├── core/           # From v2-core/src/
└── custom/         # From v2-custom/src/
```

## Development vs Production Differences

### Development Environment
- **Hot reload**: Vite dev server with live updates
- **Local functions**: Netlify dev server for local function testing
- **Environment variables**: .env files for local config
- **Build artifacts**: Incremental builds with caching

### Production Environment
- **Optimized builds**: Minified and bundled code
- **Deployed functions**: Netlify edge functions
- **Environment variables**: Netlify environment configuration
- **Static assets**: Optimized and CDN-delivered

## Deployment Pipeline

### CI/CD Process
1. **Code changes** pushed to repository
2. **Unit tests** run (`vitest.config.ts`)
3. **Assembly process** executes (`scripts/assemble-v2.sh`)
4. **Integration tests** run (if present)
5. **Build verification** (`scripts/verify-integrity.sh`)
6. **Deployment to Netlify** (via `netlify.toml`)

### Deployment Environments
- **Development**: Local Netlify dev server
- **Staging**: Netlify preview deploys (pull requests)
- **Production**: Netlify production deployment

## Deployment Dependencies

### Build Dependencies
- **Node.js**: Runtime environment
- **npm/yarn**: Package management
- **Vite**: Build tool
- **TypeScript**: Compilation
- **Tailwind CSS**: Styling

### Deployment Dependencies
- **Netlify**: Hosting platform
- **Netlify Functions**: Serverless functions
- **Netlify CLI**: Local development
- **GitHub Actions**: CI/CD pipeline

## Deployment Configuration Details

### Netlify Configuration (`netlify.toml`)
- Build command configuration
- Publish directory settings
- Function deployment settings
- Environment variable handling
- Redirect and rewrite rules

### Vite Configuration (`vite.config.ts`)
- Development server settings
- Build optimization
- Plugin configuration
- Asset handling
- Environment-specific configs

## Deployment Observations

### Potential Issues
1. **Multiple package managers**: Both package-lock.json and yarn.lock present
2. **Complex assembly**: Multi-step assembly process required
3. **Generated outputs**: Assembly creates deployed artifacts
4. **Build artifacts in root**: TypeScript cache files in project root

### Deployment Strengths
1. **Automated pipeline**: GitHub Actions for CI/CD
2. **Verification tools**: Integrity checking scripts
3. **Modular assembly**: Separate core and custom components
4. **Modern tooling**: Vite, Netlify, TypeScript

## Deployment Recommendations

### For Development
1. Use `scripts/netlify-dev-wrapper.sh` for local development
2. Run `scripts/assemble-v2.sh` after code changes
3. Use verification scripts to ensure assembly success
4. Monitor TypeScript build cache for performance

### For Production
1. Ensure CI/CD pipeline tests pass before deployment
2. Use environment-specific configuration
3. Monitor build logs for assembly issues
4. Verify deployed functionality with smoke tests

### For Maintenance
1. Clean build artifacts periodically
2. Update dependencies regularly
3. Monitor assembly script performance
4. Keep verification scripts up to date
