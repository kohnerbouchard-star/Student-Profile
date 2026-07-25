export const PLAYER_GAME_DASHBOARD_CONCURRENT_READ_LIMIT = 8;

let activeReads = 0;
const waiters: Array<() => void> = [];

export async function withPlayerGameDashboardReadPermit<T>(
  operation: () => Promise<T>,
): Promise<T> {
  await acquirePermit();
  try {
    return await operation();
  } finally {
    releasePermit();
  }
}

function acquirePermit(): Promise<void> {
  if (activeReads < PLAYER_GAME_DASHBOARD_CONCURRENT_READ_LIMIT) {
    activeReads += 1;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    waiters.push(() => {
      activeReads += 1;
      resolve();
    });
  });
}

function releasePermit(): void {
  activeReads = Math.max(0, activeReads - 1);
  const next = waiters.shift();
  next?.();
}

export function resetPlayerGameDashboardReadLimiterForTests(): void {
  activeReads = 0;
  waiters.splice(0, waiters.length);
}
