import { describe, it, expect } from "vitest";
import { pinVerifiedTls } from "../../api/db/connection";

describe("pinVerifiedTls", () => {
  it("pins sslmode=require (managed hosts) to verify-full", () => {
    const out = pinVerifiedTls(
      "postgresql://u:p@db.example.com:5432/app?sslmode=require",
    );
    expect(new URL(out).searchParams.get("sslmode")).toBe("verify-full");
    expect(new URL(out).hostname).toBe("db.example.com");
    expect(new URL(out).password).toBe("p");
  });

  it.each(["prefer", "verify-ca"])("pins sslmode=%s too", (mode) => {
    const out = pinVerifiedTls(`postgres://u:p@h/db?sslmode=${mode}&x=1`);
    expect(new URL(out).searchParams.get("sslmode")).toBe("verify-full");
    expect(new URL(out).searchParams.get("x")).toBe("1");
  });

  it.each([
    "postgres://u:p@localhost:5434/db",
    "postgres://u:p@h/db?sslmode=disable",
    "postgres://u:p@h/db?sslmode=verify-full",
    "postgres://u:p@h/db?uselibpqcompat=true&sslmode=require",
    "not a url",
  ])("leaves %s unchanged", (url) => {
    expect(pinVerifiedTls(url)).toBe(url);
  });
});
