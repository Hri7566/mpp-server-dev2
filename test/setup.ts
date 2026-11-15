/**
 * Test preload (see bunfig.toml)
 *
 * Points Prisma at a throwaway SQLite database so tests never touch the
 * real one, and rebuilds it from the schema before every run.
 */

// Relative to prisma/schema.prisma, so this is prisma/test.sqlite
const TEST_DATABASE_URL = "file:./test.sqlite";

process.env.DATABASE_URL = TEST_DATABASE_URL;

// --force-reset wipes the database, so make absolutely sure it's the test one
if (process.env.DATABASE_URL !== TEST_DATABASE_URL) {
    throw new Error("Refusing to reset a non-test database");
}

const result = Bun.spawnSync(
    [
        "./node_modules/.bin/prisma",
        "db",
        "push",
        "--force-reset",
        "--skip-generate"
    ],
    {
        env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
        stdout: "ignore",
        stderr: "pipe"
    }
);

if (result.exitCode !== 0) {
    throw new Error(
        `Unable to set up test database:\n${result.stderr.toString()}`
    );
}
