import { test, expect } from "bun:test";
import { rmdirSync, rmSync } from "node:fs";
import { Logger } from "~/util/Logger";

test("Logger saves logs", async () => {
    const logDir = "./logtest";
    const logger = new Logger("bun-test", logDir);
    const message = crypto.randomUUID();

    logger.info(message);

    const data = await Bun.file(logger.logPath).text();
    expect(data).toInclude(message);
    rmSync(logger.logPath);
    rmdirSync(logDir);
});
