import { loadEnvLocal, testDatabaseUrl } from "./env";

// Runs before every api test file in the same process as the tests, so the
// pg Pool in ../db picks up the test database.
loadEnvLocal();
process.env.DATABASE_URL = testDatabaseUrl();
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
