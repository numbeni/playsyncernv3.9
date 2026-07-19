import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.ts";

const { Pool } = pg;

function getDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  return process.env.DATABASE_URL;
}

let poolInstance: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getPool(): pg.Pool {
  if (!poolInstance) {
    poolInstance = new Pool({ connectionString: getDatabaseUrl() });
  }
  return poolInstance;
}

function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

/** Lazy database connection pool; initialized on first access. */
export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop, receiver) {
    return Reflect.get(getPool(), prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(getPool(), prop);
  },
  ownKeys(_target) {
    return Reflect.ownKeys(getPool());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getPool(), prop);
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(getPool(), prop, value, receiver);
  },
  defineProperty(_target, prop, attrs) {
    return Reflect.defineProperty(getPool(), prop, attrs);
  },
  deleteProperty(_target, prop) {
    return Reflect.deleteProperty(getPool(), prop);
  },
  apply(_target, thisArg, args) {
    return (getPool() as unknown as (...args: unknown[]) => unknown).apply(
      thisArg,
      args,
    );
  },
  construct(_target, args, newTarget) {
    return Reflect.construct(
      getPool() as unknown as new (...args: unknown[]) => unknown,
      args,
      newTarget,
    );
  },
}) as pg.Pool;

/** Lazy Drizzle ORM instance; initialized on first access. */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(getDb(), prop);
  },
  ownKeys(_target) {
    return Reflect.ownKeys(getDb());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getDb(), prop);
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(getDb(), prop, value, receiver);
  },
  defineProperty(_target, prop, attrs) {
    return Reflect.defineProperty(getDb(), prop, attrs);
  },
  deleteProperty(_target, prop) {
    return Reflect.deleteProperty(getDb(), prop);
  },
  apply(_target, thisArg, args) {
    return (getDb() as unknown as (...args: unknown[]) => unknown).apply(
      thisArg,
      args,
    );
  },
  construct(_target, args, newTarget) {
    return Reflect.construct(
      getDb() as unknown as new (...args: unknown[]) => unknown,
      args,
      newTarget,
    );
  },
});

export * from "./schema/index.ts";
