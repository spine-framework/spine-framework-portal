# Permission Examples

## Support Ticket Use Case

### Customer (user role)
- Can create tickets in their own account
- Can only see/update their own tickets
- Cannot see ARR field

### Master Support Agent (master-support role)
- Assigned to client accounts via v2.people_roles
- Can read all client tickets
- Can update most ticket fields
- Cannot see ARR field (field override)

### Master CSM (master-csm role)  
- Assigned to client accounts via v2.people_roles
- Can read all client tickets
- Can update ARR field (field override)
- Cannot delete tickets

## Schema Example

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

## API Behavior Examples

### Creating a Ticket

**Customer Request:**
```typescript
POST /functions/items
{
  "item_type": "support_ticket",
  "title": "Login issue",
  "data": {
    "description": "Cannot login to account",
    "priority": "high"
  }
}
```

**Permission Check:**
- User has `user` role
- `record_permissions.user.create` is `true`
- **Result:** Ticket created successfully

**Master Support Request:**
```typescript
POST /functions/items
{
  "item_type": "support_ticket", 
  "title": "System maintenance",
  "data": {
    "description": "Scheduled maintenance",
    "priority": "low"
  }
}
```

**Permission Check:**
- User has `master-support` role
- `record_permissions.master-support.create` is `false`
- **Result:** Permission denied

### Reading Tickets

**Customer Reading Their Own Ticket:**
```typescript
GET /functions/items?id=customer-ticket-123
```

**Permission Check:**
- User has `user` role
- `record_permissions.user.read` is `"own"`
- Ticket was created by this user
- **Result:** Returns ticket with all fields visible to user

**Customer Reading Another Customer's Ticket:**
```typescript
GET /functions/items?id=other-customer-ticket-456
```

**Permission Check:**
- User has `user` role
- `record_permissions.user.read` is `"own"`
- Ticket was NOT created by this user
- **Result:** Permission denied

**Master Support Reading Any Client Ticket:**
```typescript
GET /functions/items?id=client-ticket-789
```

**Permission Check:**
- User has `master-support` role
- `record_permissions.master-support.read` is `"all"`
- **Result:** Returns ticket, but ARR field is filtered out due to field override

### Updating Tickets

**Customer Updating Their Own Ticket:**
```typescript
PATCH /functions/items?id=customer-ticket-123
{
  "data": {
    "description": "Updated description"
  }
}
```

**Permission Check:**
- User has `user` role
- `record_permissions.user.update` is `"own"`
- Ticket was created by this user
- Field has no specific override for `user` role
- **Result:** Update successful

**Customer Trying to Update ARR Field:**
```typescript
PATCH /functions/items?id=customer-ticket-123
{
  "data": {
    "arr": 50000
  }
}
```

**Permission Check:**
- User has `user` role
- `record_permissions.user.update` is `"own"`
- Ticket was created by this user
- Field `arr` has no permission override for `user` role
- Falls back to record-level permission: `"own"` allows update
- **Result:** Update successful (if this is desired behavior, add field override to prevent)

**Master CSM Updating ARR Field:**
```typescript
PATCH /functions/items?id=client-ticket-789
{
  "data": {
    "arr": 75000
  }
}
```

**Permission Check:**
- User has `master-csm` role
- `record_permissions.master-csm.update` is `false`
- Field `arr` has override: `permissions.master-csm.write` is `true`
- **Result:** Update successful due to field override

**Master Support Trying to Update ARR Field:**
```typescript
PATCH /functions/items?id=client-ticket-789
{
  "data": {
    "arr": 75000
  }
}
```

**Permission Check:**
- User has `master-support` role
- `record_permissions.master-support.update` is `"all"`
- Field `arr` has override: `permissions.master-support.write` is `false`
- **Result:** Permission denied due to field override

## List Endpoint Behavior

**Customer Listing Tickets:**
```typescript
GET /functions/items?item_type=support_ticket
```

**Permission Check:**
- Returns only tickets user can read
- Filters out fields user cannot see
- **Result:** List of user's own tickets with appropriate field filtering

**Master Support Listing Tickets:**
```typescript
GET /functions/items?item_type=support_ticket
```

**Permission Check:**
- Returns all tickets in account
- Filters out ARR field for all tickets
- **Result:** All client tickets with ARR field removed

## System Admin Behavior

**System Admin Any Operation:**
```typescript
// Any operation as system admin
GET /functions/items?id=any-ticket
PATCH /functions/items?id=any-ticket
DELETE /functions/items?id=any-ticket
```

**Permission Check:**
- `systemRole === 'system_admin'`
- **Result:** All operations succeed, no field filtering, full audit trail maintained

## Multi-Role User Behavior

**User with Both user and master-support Roles:**
```typescript
GET /functions/items?id=other-user-ticket
```

**Permission Check:**
- User has `user` role: `record_permissions.user.read` is `"own"` - denied
- User has `master-support` role: `record_permissions.master-support.read` is `"all"` - allowed
- **Result:** Access granted (highest effective permission wins)

## Error Messages

### Permission Denied Errors
- `"Insufficient permissions to create this type of item"`
- `"Insufficient permissions to update this item"`
- `"Insufficient permissions to delete this item"`
- `"Insufficient permissions to view this item"`
- `"Insufficient permissions to update field 'field_name'"`

### Context Errors
- `"Authentication required"`
- `"Account context required"`
- `"Item not found"`

## Debugging Permission Issues

### Step 1: Check Authentication
```sql
-- Verify user is authenticated
SELECT person_id, system_role FROM v2.people WHERE auth_uid = 'user_auth_uid';
```

### Step 2: Check Account Membership
```sql
-- Verify user is member of account
SELECT * FROM v2.people_accounts 
WHERE person_id = 'user_person_id' AND account_id = 'target_account_id' AND is_active = true;
```

### Step 3: Check Role Assignments
```sql
-- Verify user has required roles
SELECT pr.role_slug, r.name 
FROM v2.people_roles pr
JOIN v2.roles r ON pr.role_id = r.id
WHERE pr.person_id = 'user_person_id' AND pr.account_id = 'target_account_id' AND pr.is_active = true;
```

### Step 4: Check Type Schema
```sql
-- Verify type schema has permissions for user's roles
SELECT schema FROM v2.types 
WHERE slug = 'support_ticket' AND is_active = true;
```

### Step 5: Check System Admin Override
```sql
-- Verify system admin status
SELECT system_role FROM v2.people WHERE id = 'user_person_id';
```

## Common Pitfalls and Solutions

### Pitfall: Missing Role Assignment
**Problem:** User cannot access records despite having correct schema
**Solution:** Verify role assignment in v2.people_roles

### Pitfall: Incorrect Account Context
**Problem:** Permission checks failing for cross-account operations
**Solution:** Ensure correct account_id in request headers

### Pitfall: Field Override Missing
**Problem:** Users can see fields they shouldn't
**Solution:** Add field-level permission overrides

### Pitfall: Access Level Misconfiguration
**Problem:** Users can't access their own records
**Solution:** Ensure read access level is set to "own" or "all"

### Pitfall: System Admin Not Working
**Problem:** System admin still getting permission denied
**Solution:** Verify systemRole is set correctly in middleware
