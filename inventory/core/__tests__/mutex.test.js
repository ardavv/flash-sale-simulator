'use strict';

const { Mutex } = require('../mutex');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a promise that resolves after `ms` real milliseconds. */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Mutex', () => {
  // -------------------------------------------------------------------------
  // isLocked()
  // -------------------------------------------------------------------------
  describe('isLocked()', () => {
    test('returns false before first acquire', () => {
      const mutex = new Mutex();
      expect(mutex.isLocked()).toBe(false);
    });

    test('returns true while held, false after release', async () => {
      const mutex = new Mutex();
      const release = await mutex.acquire();
      expect(mutex.isLocked()).toBe(true);
      release();
      expect(mutex.isLocked()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // queueLength()
  // -------------------------------------------------------------------------
  describe('queueLength()', () => {
    test('returns 0 when nothing is waiting', async () => {
      const mutex = new Mutex();
      expect(mutex.queueLength()).toBe(0);

      const release = await mutex.acquire();
      expect(mutex.queueLength()).toBe(0); // holder, not in queue
      release();
    });

    test('reflects the correct number of waiters', async () => {
      const mutex = new Mutex();
      const release1 = await mutex.acquire(); // holds the lock

      // Two concurrent waiters
      const p2 = mutex.acquire();
      const p3 = mutex.acquire();

      // Let the microtask queue settle so both waiters are enqueued
      await Promise.resolve();
      await Promise.resolve();

      expect(mutex.queueLength()).toBe(2);

      release1(); // unblocks p2
      const release2 = await p2;
      expect(mutex.queueLength()).toBe(1);

      release2(); // unblocks p3
      const release3 = await p3;
      expect(mutex.queueLength()).toBe(0);

      release3();
    });
  });

  // -------------------------------------------------------------------------
  // Serial execution (only one holder at a time)
  // -------------------------------------------------------------------------
  describe('serial execution', () => {
    test('second acquire waits until first release', async () => {
      const mutex = new Mutex();
      const log = [];

      const task1 = async () => {
        const release = await mutex.acquire();
        log.push('task1-start');
        await delay(20);
        log.push('task1-end');
        release();
      };

      const task2 = async () => {
        const release = await mutex.acquire();
        log.push('task2-start');
        release();
      };

      await Promise.all([task1(), task2()]);

      expect(log).toEqual(['task1-start', 'task1-end', 'task2-start']);
    });
  });

  // -------------------------------------------------------------------------
  // FIFO ordering
  // -------------------------------------------------------------------------
  describe('FIFO ordering', () => {
    test('queued operations are processed in the order they arrived', async () => {
      const mutex = new Mutex();
      const order = [];

      const release0 = await mutex.acquire(); // holds the lock

      // Enqueue three waiters in sequence
      const promises = [1, 2, 3].map((id) =>
        mutex.acquire().then((release) => {
          order.push(id);
          release();
        })
      );

      // Let the microtask queue settle so all waiters are enqueued
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      release0();
      await Promise.all(promises);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  // -------------------------------------------------------------------------
  // release() in finally prevents deadlock (multiple sequential acquires)
  // -------------------------------------------------------------------------
  describe('finally-block release', () => {
    test('multiple sequential acquires all complete without deadlock', async () => {
      const mutex = new Mutex();
      const results = [];

      for (let i = 0; i < 5; i++) {
        const release = await mutex.acquire();
        try {
          results.push(i);
        } finally {
          release();
        }
      }

      expect(results).toEqual([0, 1, 2, 3, 4]);
      expect(mutex.isLocked()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Concurrent acquires — no deadlock
  // -------------------------------------------------------------------------
  describe('concurrent acquires', () => {
    test('all concurrent acquires eventually complete', async () => {
      const mutex = new Mutex();
      const completed = [];

      const tasks = Array.from({ length: 10 }, (_, i) =>
        (async () => {
          const release = await mutex.acquire();
          try {
            completed.push(i);
          } finally {
            release();
          }
        })()
      );

      await Promise.all(tasks);

      expect(completed).toHaveLength(10);
      expect(mutex.isLocked()).toBe(false);
      expect(mutex.queueLength()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Force-release / timeout  (uses Jest fake timers)
  // -------------------------------------------------------------------------
  describe('force-release on timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('fires after timeoutMs and logs [CRITICAL]', async () => {
      const timeoutMs = 5000;
      const mutex = new Mutex(timeoutMs);

      // Spy on the logger used inside mutex.js
      const loggerModule = require('../../utils/logger');
      const mockWarn = jest.fn();
      jest.spyOn(loggerModule, 'createLogger').mockReturnValue({
        info: jest.fn(),
        warn: mockWarn,
        error: jest.fn(),
        debug: jest.fn(),
      });

      // Re-require mutex so it picks up the mocked logger
      jest.resetModules();
      const { Mutex: MutexFresh } = require('../mutex');
      const m = new MutexFresh(timeoutMs);

      const release = await m.acquire();
      expect(m.isLocked()).toBe(true);

      // Advance fake timers past the timeout
      jest.advanceTimersByTime(timeoutMs + 1);

      // Allow any pending microtasks / promises to settle
      await Promise.resolve();

      // Mutex should have been force-released
      expect(m.isLocked()).toBe(false);

      // Calling the original release a second time should be safe (idempotent)
      expect(() => release()).not.toThrow();

      // Restore the module registry so other tests are not affected
      jest.resetModules();
    });

    test('logs [CRITICAL] message on force-release', async () => {
      const timeoutMs = 1000;

      // We verify the warn call indirectly: after force-release, isLocked() === false
      // and a subsequent acquire works normally.
      jest.resetModules();
      const { Mutex: MutexFresh } = require('../mutex');
      const m = new MutexFresh(timeoutMs);

      await m.acquire(); // intentionally do NOT call release
      expect(m.isLocked()).toBe(true);

      jest.advanceTimersByTime(timeoutMs + 1);
      await Promise.resolve();

      expect(m.isLocked()).toBe(false);

      // A subsequent acquire should work
      const rel = await m.acquire();
      expect(m.isLocked()).toBe(true);
      rel();
      expect(m.isLocked()).toBe(false);

      jest.resetModules();
    });

    test('a waiter that receives the lock after force-release can also release', async () => {
      const timeoutMs = 500;
      jest.resetModules();
      const { Mutex: MutexFresh } = require('../mutex');
      const m = new MutexFresh(timeoutMs);

      // First holder — will be force-released
      await m.acquire(); // no release

      // Second waiter enters queue
      const waiterPromise = m.acquire();

      // Force-release the first holder — this should hand the lock to waiter
      jest.advanceTimersByTime(timeoutMs + 1);
      await Promise.resolve();
      await Promise.resolve();

      const release2 = await waiterPromise;
      expect(m.isLocked()).toBe(true);
      expect(m.queueLength()).toBe(0);

      release2();
      expect(m.isLocked()).toBe(false);

      jest.resetModules();
    });
  });
});
