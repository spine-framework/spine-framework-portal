# Spine Setup Files

**Generated:** 2026-05-22  
**Purpose:** Complete audit of files responsible for initial setup and installation of Spine Framework

## Primary Setup Documentation

### Root Level Setup Files
- `README.md` - **PRIMARY** - Main installation guide and entry point
- `.env.example` - Environment variables template for setup
- `package.json` - npm scripts and dependencies for initial setup
- `components.json` - shadcn/ui component configuration

### Core Framework Setup
- `v2-core/README.md` - **ESSENTIAL** - Core framework setup instructions
- `v2-core/.xenv.example` - Core framework environment variables
- `v2-core/package.json` - Core framework dependencies
- `v2-core/.spine-manifest.json` - Framework manifest configuration

## Setup Scripts and Tools

### Assembly Scripts (Required for Setup)
- `scripts/assemble-v2.sh` - **ESSENTIAL** - Main assembly script
- `scripts/assemble-v2-frontend.sh` - Frontend assembly
- `scripts/assemble-v2-functions.sh` - Functions assembly  
- `scripts/assemble-v2-custom.sh` - Custom code assembly
- `scripts/app-install-cli.ts` - CLI installation tool

### Verification Scripts
- `scripts/verify-integrity.sh` - Post-setup verification
- `scripts/verify-v2-integrity.sh` - Core framework integrity check
- `scripts/build-manifest.sh` - Manifest generation

## Configuration Files Required for Setup

### Build Configuration
- `vite.config.ts` - **REQUIRED** - Vite build configuration
- `tsconfig.json` - TypeScript configuration
- `tsconfig.node.json` - Node.js TypeScript configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `vitest.config.ts` - Testing configuration

### Deployment Configuration
- `netlify.toml` - Netlify deployment setup (for local dev)

## Setup Documentation

### Assembly and Launch Guides
- `v2-core/docs/assembly-launch-guide.md` - **CRITICAL** - Detailed assembly instructions
- `v2-core/docs/guides/README.md` - Guides overview

### Specific Setup Guides
- `v2-core/docs/guides/adding-new-apps.md` - Adding applications
- `v2-core/docs/guides/adding-new-types.md` - Adding data types
- `v2-core/docs/guides/custom-functions.md` - Custom function setup
- `v2-core/docs/guides/migration-best-practices.md` - Database setup
- `v2-core/docs/guides/permissions.md` - Permission setup
- `v2-core/docs/guides/pipeline-best-practices.md` - Pipeline setup
- `v2-core/docs/guides/triggers.md` - Trigger setup

## Setup Workflow Analysis

### 1. Initial Clone Setup
1. Clone repository
2. Read `README.md` (primary instructions)
3. Copy `.env.example` to `.env` and configure
4. Run `npm install` from root
5. Read `v2-core/README.md` for framework-specific setup

### 2. Framework Assembly
1. Run `scripts/assemble-v2.sh` (main assembly)
2. Assembly scripts coordinate:
   - Frontend setup (`assemble-v2-frontend.sh`)
   - Functions setup (`assemble-v2-functions.sh`)
   - Custom code integration (`assemble-v2-custom.sh`)

### 3. Configuration Verification
1. Run `scripts/verify-integrity.sh`
2. Run `scripts/verify-v2-integrity.sh`
3. Check `scripts/build-manifest.sh` output

### 4. Development Environment
1. Configuration files ensure proper build environment
2. `vite.config.ts` handles build process
3. `netlify.toml` enables local development

## Dependencies Required for Setup

### Root Dependencies
- Node.js/npm/yarn (package managers)
- Multiple lock files present (package-lock.json, yarn.lock) - indicates package manager switching

### Core Framework Dependencies
- Defined in `v2-core/package.json`
- TypeScript build chain
- Vite build system
- Tailwind CSS
- shadcn/ui components

## Critical Setup Dependencies

### Must Read First
1. `README.md` - Entry point and overview
2. `v2-core/README.md` - Framework specifics
3. `v2-core/docs/assembly-launch-guide.md` - Assembly process

### Must Execute
1. `npm install` (root level)
2. Environment configuration (.env setup)
3. `scripts/assemble-v2.sh` (framework assembly)
4. Verification scripts

### Must Configure
1. Environment variables (.env)
2. Build configuration (already configured in files)
3. Component configuration (components.json)

## Setup Observations

### Potential Issues
1. **Multiple package managers**: Both package-lock.json and yarn.lock present
2. **Complex assembly**: Multiple assembly scripts required
3. **Environment complexity**: Multiple .env.example files
4. **Generated outputs**: Assembly creates functions/ and src/ directories

### Setup Strengths
1. **Comprehensive documentation**: Multiple setup guides
2. **Verification tools**: Integrity checking scripts
3. **Modular assembly**: Separate scripts for different components
4. **Clear entry points**: README.md files guide the process

## Setup Recommendations for New Users

1. **Start with root README.md** - Primary setup instructions
2. **Configure environment early** - .env files before assembly
3. **Run assembly scripts in order** - Don't skip the main assemble-v2.sh
4. **Use verification scripts** - Ensure setup completed successfully
5. **Read assembly guide** - Understand what the scripts do
6. **Check package manager** - Choose between npm/yarn consistently
