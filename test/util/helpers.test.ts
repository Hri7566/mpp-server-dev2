import { test, expect } from "bun:test";
import * as helpers from "~/util/helpers";

test("Unimportant console text", () => {
    expect(helpers.unimportant("beans")).toStartWith("\x1b[90m");
});

test("String padding", () => {
    expect(helpers.padNum(42, 3, "p", true)).toBe("p42");
    expect(helpers.padNum(42, 3, "p", false)).toBe("42p");
});

test("Object property checking", () => {
    const data = {
        beans: 9
    };

    expect(helpers.hasOwn(data, "beans")).toBeTrue();
});

test("Darkened colors", () => {
    const color = "#480505";
    const darkened = helpers.darken(color, 0x48);

    expect(darkened).toBe("#000000");
});

test("Text spooper", () => {
    const message = "i like food";
    expect(helpers.spoop_text(message)).not.toBe(message);
});

test("Object mixins", () => {
    const obj1 = {
        apples: 3
    };

    const obj2 = {
        oranges: 5
    };

    helpers.mixin(obj1, obj2);
    expect(obj1.apples).toBe(3);
    expect((obj1 as unknown as { oranges: number }).oranges).toBe(obj2.oranges);
});

test("HSL to hex color conversion", () => {
    const h = 242;
    const s = 74;
    const l = 44;

    expect(helpers.hsl2hex(h, s, l)).toBe("#231dc3");
});

test("Time text formatter", () => {
    const ms = 5000000000;

    expect(helpers.formatMillisecondsRemaining(ms)).toBe(
        "57 days, 20 hours, 53 minutes, 20 seconds"
    );
});
