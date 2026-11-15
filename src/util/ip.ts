/**
 * Helpers for working out a client's real IP behind a reverse proxy
 */

/**
 * Normalize an IP for comparison (does not change what gets stored,
 * since user IDs are derived from the original IP string)
 * @param ip IP address
 * @returns Lowercase IP with any IPv4-mapped IPv6 prefix removed
 */
export function normalizeIP(ip: string) {
    let out = ip.trim().toLowerCase();
    if (out.startsWith("::ffff:") && out.includes(".")) out = out.substring(7);
    return out;
}

function ipv4ToInt(ip: string) {
    const parts = ip.split(".");
    if (parts.length !== 4) return;

    let out = 0;

    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return;
        const n = Number(part);
        if (n > 255) return;
        out = out * 256 + n;
    }

    return out;
}

/**
 * Check whether an IP matches an entry (exact IP or IPv4 CIDR range)
 * @param ip IP address
 * @param entry IP or CIDR range, e.g. "127.0.0.1" or "172.16.0.0/12"
 */
export function ipMatches(ip: string, entry: string) {
    const addr = normalizeIP(ip);
    const rule = normalizeIP(entry);

    if (!rule.includes("/")) return addr === rule;

    const [range, bitsText] = rule.split("/");
    const bits = Number(bitsText);
    const addrInt = ipv4ToInt(addr);
    const rangeInt = ipv4ToInt(range);

    if (addrInt === undefined || rangeInt === undefined) return false;
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;

    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return ((addrInt & mask) >>> 0) === ((rangeInt & mask) >>> 0);
}

/**
 * Check whether an IP belongs to a trusted proxy
 * @param ip IP address
 * @param trusted List of trusted IPs/ranges
 */
export function isTrustedProxy(ip: string, trusted: string[]) {
    return trusted.some(entry => ipMatches(ip, entry));
}

/**
 * Work out the client's IP
 *
 * The forwarded header is only used when the direct peer is a trusted proxy.
 * Proxies append to X-Forwarded-For, so anything a client sends ends up on
 * the left; we walk from the right and take the first untrusted address.
 * @param peerIP IP of whoever opened the connection
 * @param header Value of the forwarded header, if any
 * @param trusted List of trusted proxy IPs/ranges
 * @returns Client IP
 */
export function getClientIP(
    peerIP: string,
    header: string | null | undefined,
    trusted: string[]
) {
    if (!header || !isTrustedProxy(peerIP, trusted)) return peerIP;

    const hops = header
        .split(",")
        .map(hop => hop.trim())
        .filter(hop => hop.length > 0);

    for (let i = hops.length - 1; i >= 0; i--) {
        if (!isTrustedProxy(hops[i], trusted)) return hops[i];
    }

    // Every hop was a trusted proxy, use the furthest one
    return hops[0] ?? peerIP;
}
