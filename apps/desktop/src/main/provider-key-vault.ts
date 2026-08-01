import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { EncryptedProviderKey } from "@ai-corporation/storage";

const MASTER_KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export class VaultKeyUnavailableError extends Error {
  constructor() {
    super("Vault key is unavailable");
    this.name = "VaultKeyUnavailableError";
  }
}

export class VaultIntegrityError extends Error {
  constructor() {
    super("Vault integrity check failed");
    this.name = "VaultIntegrityError";
  }
}

export class ProviderKeyVault {
  readonly #keyPath: string;
  readonly #randomBytes: (size: number) => Buffer;

  constructor(options: {
    readonly keyPath: string;
    readonly randomBytes?: (size: number) => Buffer;
  }) {
    this.#keyPath = options.keyPath;
    this.#randomBytes = options.randomBytes ?? randomBytes;
  }

  encrypt(
    secret: string,
    entryId: string,
    allowKeyCreation = true,
  ): EncryptedProviderKey {
    const key = allowKeyCreation
      ? this.#loadOrCreateKey()
      : this.#loadExistingKey();
    const nonce = this.#randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, nonce, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(Buffer.from(entryId, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(secret, "utf8"),
      cipher.final(),
    ]);
    return {
      authTag: cipher.getAuthTag(),
      ciphertext,
      encryptionVersion: 1,
      nonce,
    };
  }

  decrypt(encrypted: EncryptedProviderKey, entryId: string): string {
    const key = this.#loadExistingKey();
    if (
      encrypted.encryptionVersion !== 1 ||
      encrypted.nonce.byteLength !== NONCE_BYTES ||
      encrypted.authTag.byteLength !== AUTH_TAG_BYTES ||
      encrypted.ciphertext.byteLength === 0
    ) {
      throw new VaultIntegrityError();
    }
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(encrypted.nonce),
        { authTagLength: AUTH_TAG_BYTES },
      );
      decipher.setAAD(Buffer.from(entryId, "utf8"));
      decipher.setAuthTag(Buffer.from(encrypted.authTag));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext)),
        decipher.final(),
      ]).toString("utf8");
    } catch (error) {
      if (error instanceof VaultIntegrityError) throw error;
      throw new VaultIntegrityError();
    }
  }

  #loadOrCreateKey(): Buffer {
    try {
      return this.#loadExistingKey();
    } catch (error) {
      if (!(error instanceof VaultKeyUnavailableError)) throw error;
    }

    try {
      mkdirSync(path.dirname(this.#keyPath), { recursive: true, mode: 0o700 });
      const key = this.#randomBytes(MASTER_KEY_BYTES);
      writeFileSync(this.#keyPath, key, { flag: "wx", mode: 0o600 });
      return key;
    } catch {
      try {
        return this.#loadExistingKey();
      } catch {
        throw new VaultKeyUnavailableError();
      }
    }
  }

  #loadExistingKey(): Buffer {
    try {
      if (!statSync(this.#keyPath).isFile()) {
        throw new VaultKeyUnavailableError();
      }
      const key = readFileSync(this.#keyPath);
      if (key.byteLength !== MASTER_KEY_BYTES) {
        throw new VaultKeyUnavailableError();
      }
      return key;
    } catch (error) {
      if (error instanceof VaultKeyUnavailableError) throw error;
      throw new VaultKeyUnavailableError();
    }
  }
}
