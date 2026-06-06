# Authorization Model Overview

## First Surface vs Second Surface

### First Surface (User Interactions)
- User is the actor
- Permissions come from type.schema + DB role assignments
- System admin bypasses all checks
- Examples: User creates account, user creates ticket, user sends message

### Second Surface (System Interactions)  
- System is the actor
- Runs with system role
- Captures triggering user/system UUID for audit
- Examples: AI agent processes ticket, timer fires, integration syncs data

### System Admin
- Complete bypass of all restrictions
- Can read/write/lock/unlock any surface
- Audit logs still record actions

## Permission Resolution

1. **Authentication** - Validate JWT, resolve personId
2. **Account Context** - Determine acting account from headers/membership
3. **Role Resolution** - Get active roles from v2.people_accounts + v2.people_roles
4. **Schema Loading** - Load type.schema for target record type
5. **Permission Evaluation** - Apply record_permissions + field overrides
6. **Multi-role Merge** - Use highest effective permission per action
7. **System Admin Bypass** - Skip all checks if system_admin

## Master/Client Access

Master account users access client records by:
1. Being assigned roles in client accounts via v2.people_roles
2. Having those roles recognized in client record's type.schema
3. No special-case permission logic required

## Type Schema Structure

```json
{
  "record_permissions": {
    "role_slug": {
      "create": boolean,
      "read": "all" | "account" | "own" | "none",
      "update": "all" | "account" | "own" | "none", 
      "delete": boolean
    }
  },
  "fields": {
    "field_name": {
      "type": "field_type",
      "permissions": {
        "role_slug": {
          "read": boolean,
          "write": boolean
        }
      }
    }
  }
}
```

## Access Levels

### Record Access Levels
- **all** - Can access all records regardless of ownership
- **account** - Can access records within the same account
- **own** - Can only access records they created
- **none** - No access

### Field Access Levels
- **true** - Can access the field
- **false** - Cannot access the field

## Multi-Role Permission Merging

When a user has multiple roles, permissions are merged using the "highest effective permission wins" rule:

- For CRUD operations: if any role allows the action, the action is allowed
- For field access: if any role allows field access, field access is allowed
- System admin bypasses all permission checks

## Implementation Details

### Shared Permission Resolver

The `resolveFirstSurfacePermissions()` function in `v2-core/functions/_shared/permissions.ts` handles:

1. Loading type schema from database
2. Resolving user roles for the account context
3. Evaluating record permissions for each role
4. Merging permissions across multiple roles
5. Applying field-level overrides

### API Integration

APIs use the permission resolver through these helper functions:

- `canAccessRecord()` - Check if user can perform action on a record
- `sanitizeRecordData()` - Filter record data based on read permissions
- `validateUpdatePermissions()` - Validate field-level write permissions

### System Admin Override

System admin users (`systemRole === 'system_admin'`) bypass all permission checks while maintaining audit trails.

## Examples

### Support Ticket Type Schema

```json
{
  "record_permissions": {
    "user": {
      "create": true,
      "read": "own",
      "update": "own",
      "delete": false
    },
    "master-support": {
      "create": false,
      "read": "all",
      "update": "all",
      "delete": false
    },
    "master-csm": {
      "create": false,
      "read": "all",
      "update": false,
      "delete": false
    }
  },
  "fields": {
    "arr": {
      "type": "number",
      "permissions": {
        "master-support": {
          "read": false,
          "write": false
        },
        "master-csm": {
          "read": true,
          "write": true
        }
      }
    }
  }
}
```

### Permission Evaluation

**Customer (user role):**
- Can create tickets
- Can only read/update their own tickets
- Cannot see ARR field

**Master Support (master-support role):**
- Cannot create tickets
- Can read all client tickets
- Can update most ticket fields
- Cannot see ARR field (field override)

**Master CSM (master-csm role):**
- Cannot create tickets
- Can read all client tickets
- Can only update ARR field (field override)
- Cannot delete tickets
