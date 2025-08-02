import { test, expect } from "bun:test";
import env from "~/util/env";

test("Env vars are loaded", () => {
    expect(env.SALT).toBeString();
});
