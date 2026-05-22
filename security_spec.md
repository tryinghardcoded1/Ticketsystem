# Firestore Security Specification

## Data Invariants
- **Customers**: Must have a valid name, email, and phone.
- **Rentals**: Must link to a customer and vehicle, have valid start/end dates.
- **Tickets**: Must link to a vehicle (via plate) and have a violation date and amount.
- **Notes**: Must have text and an author, linked to a parent rental or ticket.
- **Users**: Must have a valid role assigned manually or via bootstrap.

## Access Tiers
- **SUPER_ADMIN**: Full access to everything.
- **ADMIN**: Access to business data, restricted user management.
- **STAFF**: Read access to fleet, create/read rentals and tickets.
- **STAFF+**: Can update specific status fields.

## The Dirty Dozen (Payload Attack Scenarios)
1. **Unauthorized Create**: Non-staff creating a rental.
2. **Identity Spoofing**: User A trying to create a user profile for User B.
3. **Role Escalation**: Staff user trying to update their own role to ADMIN.
4. **Ghost Fields**: Adding `isVerified: true` to a customer record upon creation.
5. **Orphaned Rental**: Creating a rental for a non-existent plate.
6. **Time Warp**: Setting `createdAt` to a future date.
7. **Large Payload**: Injecting 1MB of text into a note field.
8. **Malicious ID**: Using `../../system/core` as a document ID.
9. **PII Leak**: Unauthenticated user listing all customer emails.
10. **State Shortcut**: Moving a rental status from 'pending' to 'cancelled' without authorization.
11. **Shadow Update**: Updating `plateNumber` on a rental after it's been active.
12. **Admin Spoofing**: Setting `request.auth.token.email` to `admin@system.com` without verification.
