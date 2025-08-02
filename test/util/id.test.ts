import { test, expect } from "bun:test";
import {
    createColor,
    createID,
    createSocketID,
    createUserIDFromIP
} from "~/util/id";

test("ID creation", () => {
    const id = createID();

    expect(id.length).toBe(24);
    expect(/[0-9A-f]/g.test(id)).toBe(true);
});

test("User ID creation by IP", () => {
    const id = createUserIDFromIP("potato");

    expect(id.length).toBe(24);
    expect(/[0-9A-f]/g.test(id)).toBe(true);
});

test("Socket ID creation", () => {
    const id = createSocketID();
    expect(id).toBeString();

    const id2 = createSocketID();
    expect(id).not.toBe(id2);
});

test("User color generation", () => {
    const id = "beans";
    const color = createColor(id);

    expect(color).toBeString();
    expect(/[0-9A-f\#]/g.test(color)).toBe(true);
    expect(color.length).toBe(7);
});
