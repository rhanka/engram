/**
 * Regression tests for F-0816-P4 / S4.4.
 *
 * Port of upstream safishamsi/graphify commit `9e6192a` (security.py):
 * the SSRF guard mis-classified addresses in the RFC 6052 NAT64 Well-Known
 * Prefix (`64:ff9b::/96`) as private/reserved because Python's
 * `ipaddress.is_reserved` returns True for that range. NAT64 addresses
 * legitimately embed *public* IPv4 in the low 32 bits, so the fix unwraps
 * the embedded IPv4 and runs the private-IP check against the embedded
 * address instead of the IPv6 wrapper.
 *
 * The TS port mirrors the same contract via `isPrivateIp`: an IPv6 address
 * inside `64:ff9b::/96` is treated like its embedded IPv4 (private iff the
 * embedded IPv4 is private). IPv4-mapped IPv6 (`::ffff:a.b.c.d`, RFC 4291)
 * gets the same unwrap because that's also a legitimate IPv4-in-IPv6 path
 * Node's `dns.lookup` can return on dual-stack hosts.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { validateUrl } from "../src/security.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateUrl NAT64 / IPv4-mapped IPv6 unwrap (F-0816-P4 / S4.4)", () => {
  it("accepts a NAT64 address embedding a public IPv4 (64:ff9b::8.8.8.8)", async () => {
    // 64:ff9b::8.8.8.8 == 64:ff9b::0808:0808
    await expect(validateUrl("http://[64:ff9b::0808:0808]/")).resolves.toBeTruthy();
  });

  it("rejects a NAT64 address embedding a private IPv4 (64:ff9b::127.0.0.1)", async () => {
    // 64:ff9b::127.0.0.1 == 64:ff9b::7f00:1
    await expect(validateUrl("http://[64:ff9b::7f00:1]/")).rejects.toThrow(/Blocked private\/internal IP/);
  });

  it("rejects a NAT64 address embedding 10.0.0.1 (private IPv4)", async () => {
    // 64:ff9b::10.0.0.1 == 64:ff9b::0a00:1
    await expect(validateUrl("http://[64:ff9b::a00:1]/")).rejects.toThrow(/Blocked private\/internal IP/);
  });

  it("accepts an IPv4-mapped IPv6 with a public embedded IPv4 (::ffff:8.8.8.8)", async () => {
    // ::ffff:8.8.8.8 == ::ffff:0808:0808
    await expect(validateUrl("http://[::ffff:0808:0808]/")).resolves.toBeTruthy();
  });

  it("rejects an IPv4-mapped IPv6 with a loopback embedded IPv4 (::ffff:127.0.0.1)", async () => {
    // ::ffff:127.0.0.1 == ::ffff:7f00:1
    await expect(validateUrl("http://[::ffff:7f00:1]/")).rejects.toThrow(/Blocked private\/internal IP/);
  });

  it("still rejects loopback IPv6 ::1", async () => {
    await expect(validateUrl("http://[::1]/")).rejects.toThrow(/Blocked private\/internal IP/);
  });

  it("still rejects link-local IPv6 (fe80::)", async () => {
    await expect(validateUrl("http://[fe80::1]/")).rejects.toThrow(/Blocked private\/internal IP/);
  });
});
