# Security Specification: Army Rating Scheme Org Chart Tracker

## 1. Data Invariants

- **Ownership Consistency**: A `RatingScheme` document has a `userId`. Only this `userId` (owner) can modify or delete the scheme.
- **Derived Authorization**: Access to any `ArmyRatingRecord` document is strictly derived from its parent `RatingScheme` referenced by `schemeId`.
  - **Shared Reading**: If `schemes/{schemeId}.isShared` is `true`, any user (even unauthenticated/anonymous or guest) can read the records in that scheme.
  - **Shared Writing**: If `schemes/{schemeId}.isShared` is `true` AND `schemes/{schemeId}.allowEdit` is `true`, any authenticated user can write, update, or delete records in that scheme.
  - **Private Control**: If `schemes/{schemeId}.isShared` is `false` or does not exist, only the scheme owner (`userId`) can read, write, update, or delete records.
- **Immutability of Key Identifiers**: Key identifiers such as `id`, `schemeId`, and `userId` must remain immutable once created on a record.
- **Server-Side Timestamps**: Timestamp fields `createdAt` and `updatedAt` must be validated using the server-provided `request.time`.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following 12 payloads represent attacks designed to break identity, integrity, state, and relationship boundaries.

### Payload 1: Unauthorized Scheme Creation (Identity Spoofing)
- **Path**: `/schemes/fake_scheme_123`
- **Action**: Create
- **Description**: Attacker tries to create a rating scheme with a `userId` belonging to a victim.
- **Payload**:
  ```json
  {
    "id": "fake_scheme_123",
    "name": "Hacked Scheme",
    "userId": "victim_user_id_456",
    "isShared": false,
    "allowEdit": false
  }
  ```

### Payload 2: Unauthorized Scheme Modification
- **Path**: `/schemes/victim_scheme_id`
- **Action**: Update
- **Description**: Attacker tries to change the name or settings of a scheme owned by someone else.
- **Payload**:
  ```json
  {
    "name": "Compromised Name",
    "updatedAt": "request.time"
  }
  ```

### Payload 3: Shadow field injection in Rating Scheme
- **Path**: `/schemes/my_scheme_id`
- **Action**: Create
- **Description**: Owner tries to inject unapproved administrative fields (e.g., `isAdmin: true` or `systemLocked: true`).
- **Payload**:
  ```json
  {
    "id": "my_scheme_id",
    "name": "Standard Scheme",
    "userId": "my_user_id_789",
    "isAdmin": true,
    "isShared": false,
    "allowEdit": false
  }
  ```

### Payload 4: Arbitrary Scheme Hijacking via Update
- **Path**: `/schemes/my_scheme_id`
- **Action**: Update
- **Description**: Owner tries to transfer scheme ownership to another user Uid.
- **Payload**:
  ```json
  {
    "userId": "some_other_user_uid"
  }
  ```

### Payload 5: Orphaned Record Creation (Orphaned Write)
- **Path**: `/records/record_777`
- **Action**: Create
- **Description**: Attacker tries to create a record referencing a non-existent parent `schemeId` to bloat database storage.
- **Payload**:
  ```json
  {
    "id": "record_777",
    "schemeId": "non_existent_scheme_999",
    "userId": "my_user_id_789",
    "name": "Smith, Jane",
    "rank": "SFC",
    "role": "Woodwinds",
    "element": "Woodwinds"
  }
  ```

### Payload 6: Foreign Scheme Record Injection
- **Path**: `/records/record_888`
- **Action**: Create
- **Description**: Attacker tries to inject a rating record into a victim's private rating scheme.
- **Payload**:
  ```json
  {
    "id": "record_888",
    "schemeId": "victim_private_scheme_abc",
    "userId": "victim_user_id_456",
    "name": "Malicious Record",
    "rank": "PVT",
    "role": "Musician",
    "element": "Brass"
  }
  ```

### Payload 7: Record ID Hijacking (ID Poisoning)
- **Path**: `/records/very_long_junk_character_id_exceeding_128_bytes_designed_to_bloat_indexes_and_poison_search_heuristics`
- **Action**: Create
- **Description**: Attacker tries to create a record with an invalid or dangerously long ID string.
- **Payload**:
  ```json
  {
    "id": "very_long_junk_character_id_exceeding_128_bytes_designed_to_bloat_indexes_and_poison_search_heuristics",
    "schemeId": "my_scheme_id",
    "userId": "my_user_id_789",
    "name": "A",
    "rank": "PVT",
    "role": "Musician",
    "element": "Brass"
  }
  ```

### Payload 8: Schema Violation (Type Poisoning)
- **Path**: `/records/record_abc`
- **Action**: Create
- **Description**: Attacker sets `rank` to a boolean type instead of a string to break frontend UI parsing.
- **Payload**:
  ```json
  {
    "id": "record_abc",
    "schemeId": "my_scheme_id",
    "userId": "my_user_id_789",
    "name": "Corrupted, R.",
    "rank": true,
    "role": "Musician",
    "element": "Brass"
  }
  ```

### Payload 9: Unauthorized Write on Shared View-Only Scheme
- **Path**: `/records/record_xyz`
- **Action**: Create
- **Description**: Attacker attempts to write a record to a scheme which is marked as shared (`isShared: true`) but editing is disabled (`allowEdit: false`).
- **Payload**:
  ```json
  {
    "id": "record_xyz",
    "schemeId": "shared_view_only_scheme",
    "userId": "attacker_user_id",
    "name": "Defaced Record",
    "rank": "SPC",
    "role": "Musician",
    "element": "Brass"
  }
  ```

### Payload 10: Parent Scheme ID Mutability Hack
- **Path**: `/records/my_record_id`
- **Action**: Update
- **Description**: Attacker tries to modify `schemeId` on an existing record to move it into another scheme.
- **Payload**:
  ```json
  {
    "schemeId": "victim_private_scheme_abc"
  }
  ```

### Payload 11: Owner ID Mutability Hack
- **Path**: `/records/my_record_id`
- **Action**: Update
- **Description**: Attacker tries to modify `userId` on an existing record to bypass ownership rules.
- **Payload**:
  ```json
  {
    "userId": "victim_user_id_456"
  }
  ```

### Payload 12: Timestamp Poisoning Attack
- **Path**: `/schemes/my_scheme_id`
- **Action**: Create
- **Description**: Attacker attempts to set `createdAt` in the past or far future using a client-side timestamp.
- **Payload**:
  ```json
  {
    "id": "my_scheme_id",
    "name": "Standard Scheme",
    "userId": "my_user_id_789",
    "isShared": false,
    "allowEdit": false,
    "createdAt": "2010-01-01T00:00:00Z"
  }
  ```

---

## 3. Test Suite Specification (Conceptual Verification)

Conceptually, a complete unit test suite `firestore.rules.test.ts` is configured as follows to verify that all the malicious payloads above are rejected:

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// Verification checks:
// 1. Creating any document without being authenticated must fail (unless reading shared profiles)
// 2. Modifying schemes owned by victim_user_id_456 while signed in as my_user_id_789 must FAIL
// 3. Injecting "isAdmin: true" or other unapproved fields in schemes/records must FAIL due to key enforcement
// 4. Updating "userId" or "schemeId" must FAIL
// 5. Creating a record where the parent schemeId doesn't exist must FAIL
```
