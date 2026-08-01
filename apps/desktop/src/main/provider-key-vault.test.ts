import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EncryptedProviderKey } from "@ai-corporation/storage";
import {
  ProviderKeyVault,
  VaultIntegrityError,
  VaultKeyUnavailableError,
} from "./provider-key-vault";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { force: true, recursive: true });
  }
});

function fixture(): { readonly keyPath: string; readonly root: string } {
  const root = mkdtempSync(path.join(tmpdir(), "M2-TU-02-vault-"));
  roots.push(root);
  return { root, keyPath: path.join(root, "key-vault", "master-key-v1") };
}

describe("ProviderKeyVault", () => {
  it("creates one local key and encrypts with unique nonces", () => {
    const { keyPath } = fixture();
    let counter = 0;
    const vault = new ProviderKeyVault({
      keyPath,
      randomBytes: (size) => Buffer.alloc(size, ++counter),
    });
    const entryId = "019b7f4d-a000-7000-8000-000000000021";
    const secret = "M2-TU-02-random-fake-secret";

    const first = vault.encrypt(secret, entryId);
    const masterKey = readFileSync(keyPath);
    const second = vault.encrypt(secret, entryId);

    expect(masterKey).toHaveLength(32);
    expect(readFileSync(keyPath)).toEqual(masterKey);
    expect(first.nonce).not.toEqual(second.nonce);
    expect(Buffer.from(first.ciphertext).toString("utf8")).not.toContain(
      secret,
    );
    expect(vault.decrypt(first, entryId)).toBe(secret);
    expect(vault.decrypt(second, entryId)).toBe(secret);
  });

  it("fails closed for missing or invalid local keys", () => {
    const { keyPath } = fixture();
    const vault = new ProviderKeyVault({ keyPath });
    expect(() =>
      vault.decrypt(
        {
          authTag: Buffer.alloc(16),
          ciphertext: Buffer.from("cipher"),
          encryptionVersion: 1,
          nonce: Buffer.alloc(12),
        },
        "019b7f4d-a000-7000-8000-000000000022",
      ),
    ).toThrow(VaultKeyUnavailableError);

    mkdirSync(path.dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, Buffer.alloc(31), { flag: "wx" });
    expect(() => vault.encrypt("fake", "entry")).toThrow(
      VaultKeyUnavailableError,
    );
  });

  it("rejects tampering, unknown versions, and a different entry binding", () => {
    const { keyPath } = fixture();
    const vault = new ProviderKeyVault({ keyPath });
    const entryId = "019b7f4d-a000-7000-8000-000000000023";
    const encrypted = vault.encrypt("M2-TU-02-fake", entryId);
    for (const tampered of [
      {
        ...encrypted,
        ciphertext: Buffer.from(encrypted.ciphertext).map((value, index) =>
          index === 0 ? value ^ 1 : value,
        ),
      },
      {
        ...encrypted,
        nonce: Buffer.from(encrypted.nonce).map((value, index) =>
          index === 0 ? value ^ 1 : value,
        ),
      },
      {
        ...encrypted,
        authTag: Buffer.from(encrypted.authTag).map((value, index) =>
          index === 0 ? value ^ 1 : value,
        ),
      },
      { ...encrypted, encryptionVersion: 2 },
    ]) {
      expect(() =>
        vault.decrypt(tampered as unknown as EncryptedProviderKey, entryId),
      ).toThrow(VaultIntegrityError);
    }
    expect(() => vault.decrypt(encrypted, `${entryId}-other`)).toThrow(
      VaultIntegrityError,
    );
  });
});
