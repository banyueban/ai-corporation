import type { ProviderErrorCode } from "@ai-corporation/protocols";

export function providerErrorMessage(code: ProviderErrorCode): string {
  const messages: Record<ProviderErrorCode, string> = {
    INVALID_REQUEST: "Check the name, Endpoint, status, and Key, then retry.",
    UNAUTHORIZED_CALLER:
      "The page is not authorized to manage Provider credentials.",
    NOT_FOUND: "The Provider or saved Key no longer exists. Reload the list.",
    CONFLICT: "A newer Provider version exists. Reload before saving.",
    IDEMPOTENCY_CONFLICT:
      "This operation identifier was already used for a different change.",
    VAULT_KEY_UNAVAILABLE:
      "The app-managed local encryption key is unavailable. No Key change was saved.",
    VAULT_INTEGRITY_FAILED:
      "The saved Key failed its integrity check. Delete it and enter a new Key.",
    STORAGE_UNAVAILABLE:
      "The local database is unavailable. Your current input is retained.",
    INTERNAL:
      "An internal failure occurred. No successful Key change was confirmed.",
  };
  return messages[code];
}
