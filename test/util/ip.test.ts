import { expect, test } from "bun:test";
import { getClientIP, ipMatches } from "~/util/ip";

const trusted = ["127.0.0.1", "::1", "172.16.0.0/12"];

test("ipMatches handles exact IPs, mapped IPv4 and CIDR ranges", () => {
    expect(ipMatches("127.0.0.1", "127.0.0.1")).toBe(true);
    expect(ipMatches("::ffff:127.0.0.1", "127.0.0.1")).toBe(true);
    expect(ipMatches("::1", "::1")).toBe(true);
    expect(ipMatches("172.17.0.1", "172.16.0.0/12")).toBe(true);
    expect(ipMatches("172.32.0.1", "172.16.0.0/12")).toBe(false);
    expect(ipMatches("8.8.8.8", "0.0.0.0/0")).toBe(true);
    expect(ipMatches("not an ip", "172.16.0.0/12")).toBe(false);
});

test("forwarded header is ignored from untrusted peers", () => {
    // Someone connecting directly can't pretend to be another IP
    expect(getClientIP("203.0.113.5", "1.2.3.4", trusted)).toBe("203.0.113.5");
});

test("forwarded header is used from trusted proxies", () => {
    expect(getClientIP("127.0.0.1", "1.2.3.4", trusted)).toBe("1.2.3.4");
    expect(getClientIP("::ffff:127.0.0.1", "1.2.3.4", trusted)).toBe(
        "1.2.3.4"
    );
    expect(getClientIP("127.0.0.1", null, trusted)).toBe("127.0.0.1");
});

test("client-supplied X-Forwarded-For entries can't spoof the IP", () => {
    // nginx appends the real address to whatever the client sent
    expect(getClientIP("127.0.0.1", "6.6.6.6, 1.2.3.4", trusted)).toBe(
        "1.2.3.4"
    );

    // Chained trusted proxies are skipped
    expect(
        getClientIP("127.0.0.1", "6.6.6.6, 1.2.3.4, 172.17.0.1", trusted)
    ).toBe("1.2.3.4");
});
