import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 10,
  });

const isDev = process.env.NODE_ENV !== 'production';
if (isDev) {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
