# Concurrency & MongoDB Transaction Architecture

## Overview
To eliminate race conditions and double bookings when two simultaneous requests attempt to reserve the same room at the same millisecond, the PMS implements a dual-layer concurrency protection strategy:

1. **In-Memory Per-Room Mutex (`withRoomLock`)**:
   - Serializes concurrent reservation requests targeting the same `roomId` within the application event loop.
   - Distinct rooms proceed in parallel with zero contention.
   - Ensures that when two requests arrive simultaneously, Request 1 evaluates room availability, persists the reservation, and commits before Request 2 begins its availability evaluation.
   - Request 2 immediately evaluates against the freshly committed state and receives HTTP 409 ("Room is not available for selected dates").

2. **MongoDB Multi-Document ACID Transactions (`runWithOptionalTransaction`)**:
   - Wraps multi-collection operations (`Guest`, `Reservation`, `Booking`, `Room`) in a MongoDB session transaction.
   - Ensures all-or-nothing atomicity across document creation and room status changes.
   - Automatically aborts on errors or conflicts.
   - Employs **graceful fallback** for standalone development environments (error codes `20` / `IllegalOperation` / "Transaction numbers are only allowed on a replica set member"), falling back to non-transactional execution without crashing or requiring special local replica set configuration.

3. **Collision-Resistant Reservation Number Generation (`generateReservationNumber`)**:
   - Replaced naive `countDocuments() + 1` with a query that scans the maximum sequence number for the current month prefix (`RESYYMM#####`) and includes an active collision detection loop.
   - Prevents `E11000 duplicate key error` on `reservationNumber_1` even when prior reservations were cancelled or deleted.

---

## Deployment Requirements for MongoDB Transactions

- **Production Environment**:
  - MongoDB version 4.0 or higher is required for multi-document transactions.
  - The database cluster must be running as a **Replica Set** (e.g. MongoDB Atlas, AWS DocumentDB with replica sets, or self-hosted 3-member replica set).
  - MongoDB Atlas clusters support multi-document transactions out of the box.

- **Local / Development Environment**:
  - If a local standalone `mongod` instance without replica set is used, the system automatically detects the environment and gracefully falls back to non-transactional execution.
  - The in-memory room mutex (`withRoomLock`) continues to guard against race conditions in single-instance development servers.
  - To enable full replica-set transactions locally, start `mongod` with `--replSet rs0` and run `rs.initiate()`.
