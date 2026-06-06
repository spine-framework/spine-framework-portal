# Audit: Eliminate v2 References

**Date:** 2026-05-27
**Scope:** Remove all "v2" naming from codebase (files, comments, documentation, code)
**Exclusions:** 
- `.assembled/` directory (rebuilt on assembly)
- Migration files (separate exercise)
- `node_modules/`, `.git/`

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Documentation files | 4 | ✅ Complete |
| Configuration files | 1 | ✅ Complete |
| Script files | 0 | ✅ Complete |
| Source code files | 5 | ✅ Complete |
| **Total** | **10** | **✅ Complete** |

---

## Detailed Findings

### 1. Documentation Files ✅

#### `STRUCTURE.md` (line 3)
- ✅ **Done:** "This document explains the directory layout for the Spine framework."

#### `docs/shadcn-migration-plan.md`
- ✅ **Archived:** Moved to `archive/shadcn-migration-plan.md` (historical document)

#### `docs/spine-core--api-reference.md`
- ✅ **Done:** Updated title and content to "Spine Core API Reference"

#### `docs/functions-core-vs-custom.md`
- ✅ **Done:** Updated to reference `.framework/functions/` instead of `v2-core/functions/`

---

### 2. Configuration Files ✅

#### `config/tsconfig.json`
- ✅ **Done:** Updated all path aliases:
  - `"@core/*": ["../.framework/src/*"]` (was `v2-core/src`)
  - `"@custom/*": ["../custom/*"]` (was `v2-custom/src`)
  - `"@shared/*": ["../.framework/functions/_shared/*"]` (was `v2-core/functions/_shared`)
  - `"include": [".assembled/src", ".framework/functions"]` (was `v2-core`)

#### `config/vite.config.ts`
- ✅ **Done:**
  - Updated comment: "Vite config for Spine"
  - Removed `__V2__: 'true'` runtime flag (verified unused in codebase)

---

### 3. Script Files ✅

All assembly scripts have been cleaned:
- ✅ `scripts/assemble.sh` (was `assemble-v2.sh`)
- ✅ `scripts/assemble-frontend.sh` (was `assemble-v2-frontend.sh`)
- ✅ `scripts/assemble-functions.sh` (was `assemble-v2-functions.sh`)
- ✅ `scripts/assemble-v2-custom.sh` (deleted - was legacy stub)
- ✅ `scripts/netlify-dev-wrapper.sh`

---

### 4. Source Code Files ✅

All comment references to "v2" have been cleaned:
- ✅ `.framework/src/types/types.ts` - "Spine v2 frontend" → "Spine frontend"
- ✅ `.framework/src/types/auth.ts` - "Spine v2 frontend" → "Spine frontend"
- ✅ `.framework/src/lib/supabase.ts` - "Spine v2 frontend" → "Spine frontend"
- ✅ `.framework/src/contexts/AuthContext.tsx` - "Spine v2 frontend" → "Spine frontend"

---

### 5. Remaining v2 References (Expected)

#### Historical Documents (Archives)
- `archive/shadcn-migration-plan.md` - Retains v2 context as historical record

#### Migration Files (Excluded per scope)
- `.framework/migrations/` - Will be addressed in separate migration cleanup
- `custom/migrations/` - Will be addressed in separate migration cleanup

#### `.windsurf/plans/` (Historical Records)
- Plan files retain v2 naming for historical context - **Do not modify**

---

## Action Plan

### Phase 1: Documentation ✅
1. ✅ Update `STRUCTURE.md`
2. ✅ Update `docs/spine-core--api-reference.md`
3. ✅ Archive `docs/shadcn-migration-plan.md`
4. ✅ Update `docs/functions-core-vs-custom.md`

### Phase 2: Configuration ✅
1. ✅ Update `config/tsconfig.json` path aliases
2. ✅ Update `config/vite.config.ts` comments
3. ✅ Audit and remove `__V2__` runtime flag

### Phase 3: Source Code ✅
1. ✅ Fix all comment references in `.framework/src/`
2. ✅ Verified no path references to v2-core/v2-custom remain

### Phase 4: Verification ✅
1. ✅ Assembly tested and working
2. ✅ Dev server starts correctly

---

## Completion Criteria

- [x] Zero references to "v2" or "V2" in user-facing documentation
- [x] Zero references in code comments (except historical context if appropriate)
- [x] Zero references in configuration files
- [x] `__V2__` runtime flag removed or renamed
- [x] Assembly and dev server work correctly
- [x] No broken links or references

---

## Notes

- **Historical context:** Some documents (like `shadcn-migration-plan.md`) may be archived rather than updated, as they describe a completed migration.
- **Runtime flag:** `__V2__` in vite.config.ts should be checked for usage before removal. If used for feature detection, coordinate with any dependent code.
- **Testing:** After each batch of changes, run `npm run assemble && netlify dev` to verify nothing breaks.
