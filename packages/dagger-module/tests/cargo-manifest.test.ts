import { expect, test } from "vitest";
import { GhReusablePipelines } from "../src/index";

const parseCargoManifest = (raw: string) =>
  (new GhReusablePipelines() as any).parseCargoManifest(raw) as {
    name: string;
    version: string;
  };

test("parses name and version from a [package] section", () => {
  const raw = `[package]
name = "hello_world"
version = "0.1.0"
edition = "2021"

[dependencies]
`;
  expect(parseCargoManifest(raw)).toEqual({
    name: "hello_world",
    version: "0.1.0",
  });
});

test("parses a trailing [package] section with no sections after it", () => {
  const raw = `[package]
name = "onlypkg"
version = "0.1.0"
`;
  expect(parseCargoManifest(raw)).toEqual({
    name: "onlypkg",
    version: "0.1.0",
  });
});

test("throws when there is no [package] section", () => {
  const raw = `[workspace]
members = ["a"]
`;
  expect(() => parseCargoManifest(raw)).toThrow(
    "Cargo.toml must contain a [package] section",
  );
});

test("throws when package.name is missing", () => {
  const raw = `[package]
version = "0.1.0"
`;
  expect(() => parseCargoManifest(raw)).toThrow(
    "Cargo.toml must define package.name",
  );
});

test("throws when package.version is missing", () => {
  const raw = `[package]
name = "hello_world"
`;
  expect(() => parseCargoManifest(raw)).toThrow(
    "Cargo.toml must define package.version",
  );
});
