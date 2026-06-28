'use strict';

const { createLogger } = require('../utils/logger');

const logger = createLogger('MUTEX');

/**
 * Async queue-based Mutex.
 *
 * Guarantees mutual exclusion for async critical sections in a single-threaded
 * Node.js process.  Because Node.js is single-threaded, the queue push and
 * dequeue operations are themselves atomic — no additional locking is needed
 * around the queue itself.
 *
 * Usage:
 *   const release = await mutex.acquire();
 *   try {
 *     // critical section
 *   } finally {
 *     release();
 *   }
 */
class Mutex {
  /**
   * @param {number} [timeoutMs=5000]  Maximum milliseconds a caller may hold
   *   the mutex before a force-release is triggered.
   */
  constructor(timeoutMs = 5000) {
    this._timeoutMs = timeoutMs;
    /** @type {boolean} Whether the mutex is currently held. */
    this._locked = false;
    /**
     * FIFO queue of waiters.
     * Each entry: { resolve: Function, timeoutHandle: NodeJS.Timeout }
     * @type {Array<{ resolve: Function, timeoutHandle: ReturnType<typeof setTimeout> }>}
     */
    this._queue = [];
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Acquire the mutex.
   *
   * If the mutex is free, lock it immediately and return a `release` function.
   * If the mutex is held, enqueue this caller and return a Promise that resolves
   * to a `release` function once it is this caller's turn.
   *
   * @returns {Promise<Function>} Resolves to a `release` function.
   */
  async acquire() {
    if (!this._locked) {
      // Fast path — nobody holds the mutex.
      this._locked = true;
      return this._buildRelease();
    }

    // Slow path — enqueue and wait.
    return new Promise((resolve) => {
      const entry = { resolve, timeoutHandle: null };
      this._queue.push(entry);

      // Timeout guard: if this waiter never gets the mutex within timeoutMs
      // after being dequeued (i.e. after its resolver is called), we handle
      // that in _buildRelease.  However the design spec also implies a global
      // guard: any acquire that is held for too long gets force-released.
      // The timeout is therefore started inside _buildRelease (not here).
    });
  }

  /**
   * Returns `true` if the mutex is currently held by any caller.
   * @returns {boolean}
   */
  isLocked() {
    return this._locked;
  }

  /**
   * Returns the number of callers currently waiting to acquire the mutex.
   * @returns {number}
   */
  queueLength() {
    return this._queue.length;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a `release` closure for the current holder.
   *
   * The closure:
   *  1. Clears the force-release timeout (prevents spurious releases).
   *  2. Is idempotent — calling it more than once is safe.
   *  3. Hands the lock to the next waiter (FIFO) or marks the mutex as free.
   *
   * A `setTimeout` is started immediately so that if the holder never calls
   * `release()`, the mutex is force-released after `_timeoutMs`.
   *
   * @returns {Function} The release function.
   */
  _buildRelease() {
    let released = false;

    const release = () => {
      if (released) return; // Idempotent.
      released = true;

      // Disarm the watchdog timer.
      clearTimeout(timeoutHandle);

      if (this._queue.length === 0) {
        // Nobody waiting — simply unlock.
        this._locked = false;
      } else {
        // Hand the lock to the next waiter in FIFO order.
        const next = this._queue.shift();
        // Clear the waiter's own queuing timeout handle (unused currently, but
        // kept for forward compatibility).
        clearTimeout(next.timeoutHandle);

        // Resolve the waiter's Promise with a fresh release function.
        // Note: `_locked` stays `true` because the next holder takes over.
        next.resolve(this._buildRelease());
      }
    };

    // Watchdog: force-release if the holder doesn't call release() in time.
    const timeoutHandle = setTimeout(() => {
      if (!released) {
        logger.warn('[CRITICAL] Mutex force-released', { timeoutMs: this._timeoutMs });
        release();
      }
    }, this._timeoutMs);

    return release;
  }
}

module.exports = { Mutex };
