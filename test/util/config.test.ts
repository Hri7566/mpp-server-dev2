import { test, expect } from "bun:test";
import { rmSync } from "node:fs";
import { ConfigManager } from "~/util/config";

test("Config reading and writing", () => {
    const filePath = "config/potato.yml";
    let potato = true;
    const defaultConfig = {
        potato
    };

    const config = ConfigManager.loadConfig(filePath, defaultConfig);
    expect(config.potato).toBe(potato);

    rmSync(filePath);
});
