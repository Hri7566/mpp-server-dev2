import { afterAll, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { Logger } from "~/util/Logger";

const logDir = "./logtest";

afterAll(() => {
    rmSync(logDir, { recursive: true, force: true });
});

/**
 * Wait for the log file to contain some text
 * (Logger writes asynchronously, so it won't be there immediately)
 */
async function waitForLog(logger: Logger, text: string, timeoutMs = 2000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        const file = Bun.file(logger.logPath);
        if ((await file.exists()) && (await file.text()).includes(text)) {
            return await file.text();
        }

        await Bun.sleep(10);
    }

    return (await Bun.file(logger.logPath).text().catch(() => "")) as string;
}

test("Logger saves logs", async () => {
    const logger = new Logger("bun-test", logDir);
    const message = crypto.randomUUID();

    logger.info(message);

    expect(await waitForLog(logger, message)).toInclude(message);
});

test("Logger never throws on hostile objects", async () => {
    const logger = new Logger("bun-test-hostile", logDir);
    const marker = crypto.randomUUID();

    // Objects like these come straight from client JSON
    const hostile = [
        { toString: 1 },
        { toString: {}, valueOf: 1 },
        Object.create(null),
        { nested: { toString: 2 } }
    ];

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => {
        logger.warn(marker, ...hostile, circular, 10n, Symbol("s"));
    }).not.toThrow();

    expect(await waitForLog(logger, marker)).toInclude(marker);
});

test("Logger survives a closed readline", () => {
    const logger = new Logger("bun-test-rl", logDir);
    const g = globalThis as unknown as { rl?: unknown };
    const previous = g.rl;

    g.rl = {
        closed: false,
        prompt() {
            throw new Error("readline was closed");
        }
    };

    try {
        expect(() => logger.info("still fine")).not.toThrow();
    } finally {
        g.rl = previous;
    }
});
