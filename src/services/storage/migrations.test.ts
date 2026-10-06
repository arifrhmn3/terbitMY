import { describe, expect, it } from '@jest/globals';

import { migrate, migrations, type MigratableDatabase } from './migrations';

function fakeDatabase(userVersion: number) {
  const executed: string[] = [];
  let version = userVersion;
  const db: MigratableDatabase = {
    async getFirstAsync<T>() {
      return { user_version: version } as T;
    },
    async execAsync(sql) {
      executed.push(sql);
      const match = /PRAGMA user_version = (\d+)/.exec(sql);
      if (match) version = Number(match[1]);
    },
    async withTransactionAsync(task) {
      await task();
    },
  };
  return { db, executed, version: () => version };
}

describe('migrate', () => {
  it('runs every migration on a new database', async () => {
    const fake = fakeDatabase(0);
    expect(await migrate(fake.db)).toBe(migrations.length);
    expect(fake.version()).toBe(migrations.length);
    expect(fake.executed[0]).toContain('CREATE TABLE IF NOT EXISTS alarms');
  });

  it('does nothing when the database is up to date', async () => {
    const fake = fakeDatabase(migrations.length);
    expect(await migrate(fake.db)).toBe(0);
    expect(fake.executed).toEqual([]);
  });
});
