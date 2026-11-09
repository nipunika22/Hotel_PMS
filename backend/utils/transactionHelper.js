// backend/utils/transactionHelper.js
const mongoose = require("mongoose");

// In-memory mutex map for serializing concurrent booking attempts for the same room
// within the Node.js application process.
const roomLocks = new Map();

/**
 * Acquire an in-memory lock for a specific room to serialize concurrent operations
 * within the Node.js application process.
 *
 * @param {string|mongoose.Types.ObjectId} roomId
 * @param {Function} fn
 * @returns {Promise<any>}
 */
async function withRoomLock(roomId, fn) {
  if (!roomId) return fn();
  const key = roomId.toString();
  
  while (roomLocks.has(key)) {
    try {
      await roomLocks.get(key);
    } catch (e) {
      // previous lock error should not prevent next acquisition
    }
  }

  let release;
  const lockPromise = new Promise(resolve => {
    release = resolve;
  });
  roomLocks.set(key, lockPromise);

  try {
    return await fn();
  } finally {
    roomLocks.delete(key);
    release();
  }
}

/**
 * Executes a function within a MongoDB transaction if the server topology supports it
 * (e.g. MongoDB Atlas replica set, local replica set). If the deployment is a standalone
 * MongoDB instance without replica set support, it gracefully falls back to non-transactional
 * execution without failing or disrupting development.
 *
 * @param {Function} workFn - async function(session) to execute
 * @returns {Promise<any>} - result of workFn
 */
async function runWithOptionalTransaction(workFn) {
  let session = null;
  try {
    session = await mongoose.startSession();
  } catch (err) {
    // If sessions cannot be created, execute without session
    return workFn(null);
  }

  try {
    let result;
    let isStandalone = false;

    try {
      await session.withTransaction(async () => {
        result = await workFn(session);
      });
      return result;
    } catch (error) {
      const isStandaloneError = 
        error.message?.includes("Transaction numbers are only allowed on a replica set member or mongos") ||
        error.code === 20 ||
        error.codeName === "IllegalOperation";

      if (isStandaloneError) {
        isStandalone = true;
      } else {
        throw error;
      }
    }

    if (isStandalone) {
      console.warn("MongoDB replica set required for transactions; falling back to non-transactional execution.");
      return await workFn(null);
    }
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (endErr) {
        // ignore endSession error
      }
    }
  }
}

module.exports = {
  withRoomLock,
  runWithOptionalTransaction
};
