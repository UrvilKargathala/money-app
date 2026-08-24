import { loadEnvLocal, testDatabaseUrl } from "./env";

// Runs before every api test file in the same process as the tests, so the
// pg Pool in ../db picks up the test database.
loadEnvLocal();
process.env.DATABASE_URL = testDatabaseUrl();
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
// Server DEK for the vault recovery copy — tests use a fixed dev key.
process.env.DATA_ENCRYPTION_KEY =
  process.env.DATA_ENCRYPTION_KEY ?? "test-only-data-encryption-key";
