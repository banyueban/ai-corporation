import type {
  ProviderErrorCode,
  ProviderPublic,
} from "@ai-corporation/protocols";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createUuidV7 } from "./uuid-v7";

type FormState = {
  readonly name: string;
  readonly endpoint: string;
  readonly key: string;
  readonly configStatus: "ENABLED" | "DISABLED";
};

const emptyForm: FormState = {
  name: "",
  endpoint: "https://api.openai.com/v1",
  key: "",
  configStatus: "ENABLED",
};

export function ProviderSettings() {
  const [providers, setProviders] = useState<readonly ProviderPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ProviderErrorCode>();
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<ProviderPublic>();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showKey, setShowKey] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await window.desktop.provider.list({ schemaVersion: 1 });
      if (!result.ok) {
        setError(result.error.code);
        return;
      }
      setProviders(result.value);
    } catch {
      setError("STORAGE_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    headingRef.current?.focus();
  }, []);

  const startCreate = () => {
    setEditing(undefined);
    setForm(emptyForm);
    setShowKey(false);
    setError(undefined);
    setStatus("");
  };

  const startEdit = (provider: ProviderPublic) => {
    setEditing(provider);
    setForm({
      name: provider.name,
      endpoint: provider.endpoint,
      key: "",
      configStatus: provider.configStatus,
    });
    setShowKey(false);
    setError(undefined);
    setStatus("");
  };

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(undefined);
    setStatus("");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    setStatus("");
    try {
      const result = await window.desktop.provider.save({
        schemaVersion: 1,
        commandId: createUuidV7(),
        ...(editing === undefined
          ? {}
          : { providerId: editing.id, expectedVersion: editing.version }),
        name: form.name,
        endpoint: form.endpoint,
        configStatus: form.configStatus,
        ...(form.key.length === 0 ? {} : { key: form.key }),
      });
      if (!result.ok) {
        setError(result.error.code);
        return;
      }
      setProviders((current) => replaceProvider(current, result.value));
      setEditing(result.value);
      setForm((current) => ({ ...current, key: "" }));
      setShowKey(false);
      setStatus(
        editing === undefined ? "Provider saved." : "Provider updated.",
      );
    } catch {
      setError("STORAGE_UNAVAILABLE");
    } finally {
      setPending(false);
    }
  };

  const toggleReveal = async () => {
    if (showKey) {
      setShowKey(false);
      return;
    }
    if (form.key.length > 0 || editing?.hasKey !== true) {
      setShowKey(true);
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await window.desktop.provider.revealKey({
        schemaVersion: 1,
        providerId: editing.id,
      });
      if (!result.ok) {
        setError(result.error.code);
        return;
      }
      setForm((current) => ({ ...current, key: result.value.key }));
      setShowKey(true);
      setStatus("Key is visible for this page only.");
    } catch {
      setError("STORAGE_UNAVAILABLE");
    } finally {
      setPending(false);
    }
  };

  const deleteKey = async () => {
    if (
      editing === undefined ||
      !editing.hasKey ||
      !window.confirm(
        `Delete the saved Key for “${editing.name}”? The Provider will remain configured.`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await window.desktop.provider.deleteKey({
        schemaVersion: 1,
        commandId: createUuidV7(),
        providerId: editing.id,
        expectedVersion: editing.version,
      });
      if (!result.ok) {
        setError(result.error.code);
        return;
      }
      setProviders((current) => replaceProvider(current, result.value));
      setEditing(result.value);
      setForm((current) => ({ ...current, key: "" }));
      setShowKey(false);
      setStatus(
        "Saved Key deleted. Provider calls are blocked until a new Key is saved.",
      );
    } catch {
      setError("STORAGE_UNAVAILABLE");
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="provider-settings-title">
      <header className="page-header page-header--create">
        <div>
          <p className="eyebrow">Settings / Providers</p>
          <h1 id="provider-settings-title" ref={headingRef} tabIndex={-1}>
            Provider credentials
          </h1>
          <p>
            Keys are encrypted by AI Corporation Desktop and stored in its local
            SQLite database. The local encryption key is app-managed; this is
            not OS secure storage.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={startCreate}
          type="button"
        >
          + Add Provider
        </button>
      </header>

      {loading ? (
        <div aria-label="Loading Providers" className="skeleton-card" />
      ) : (
        <div className="provider-settings-grid">
          <aside aria-label="Saved Providers" className="provider-list-panel">
            <h2>Providers</h2>
            {providers.length === 0 ? (
              <p className="provider-empty">No Provider has been saved.</p>
            ) : (
              <ul>
                {providers.map((provider) => (
                  <li key={provider.id}>
                    <button
                      aria-current={
                        editing?.id === provider.id ? "true" : undefined
                      }
                      className="provider-list-button"
                      onClick={() => startEdit(provider)}
                      type="button"
                    >
                      <strong>{provider.name}</strong>
                      <span>
                        {provider.hasKey ? "Key saved" : "Key required"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <form className="provider-form" onSubmit={save}>
            <div>
              <p className="eyebrow">
                {editing === undefined ? "New Provider" : "Edit Provider"}
              </p>
              <h2>{editing?.name ?? "OpenAI-compatible Provider"}</h2>
            </div>

            {error !== undefined && (
              <div className="provider-error" role="alert">
                <strong>Provider change was not completed.</strong>
                <p>{providerErrorMessage(error)}</p>
              </div>
            )}

            <label className="field">
              <span>Name</span>
              <input
                autoComplete="off"
                maxLength={200}
                onChange={(event) => update("name", event.target.value)}
                required
                value={form.name}
              />
            </label>
            <label className="field">
              <span>Endpoint</span>
              <input
                autoComplete="url"
                maxLength={2_048}
                onChange={(event) => update("endpoint", event.target.value)}
                required
                type="url"
                value={form.endpoint}
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select
                onChange={(event) => update("configStatus", event.target.value)}
                value={form.configStatus}
              >
                <option value="ENABLED">Enabled</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </label>
            <div className="field">
              <label htmlFor="provider-api-key">API Key</label>
              <div className="secret-input-row">
                <input
                  aria-describedby="key-storage-note"
                  autoComplete="off"
                  id="provider-api-key"
                  onChange={(event) => update("key", event.target.value)}
                  placeholder={
                    editing?.hasKey === true
                      ? "Saved Key remains unchanged"
                      : "Enter API Key"
                  }
                  required={editing === undefined || editing.hasKey === false}
                  type={showKey ? "text" : "password"}
                  value={form.key}
                />
                <button
                  aria-pressed={showKey}
                  className="secondary-button"
                  disabled={
                    pending ||
                    (editing?.hasKey !== true && form.key.length === 0)
                  }
                  onClick={() => void toggleReveal()}
                  type="button"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              <small id="key-storage-note">
                The Key is masked by default. Show returns the saved plaintext
                only after your explicit action; leaving this page masks it
                again.
              </small>
            </div>

            <div className="provider-form-actions">
              <button
                className="primary-button"
                disabled={pending}
                type="submit"
              >
                {pending
                  ? "Saving…"
                  : editing === undefined
                    ? "Save Provider"
                    : "Save changes"}
              </button>
              {editing?.hasKey === true && (
                <button
                  className="danger-button"
                  disabled={pending}
                  onClick={() => void deleteKey()}
                  type="button"
                >
                  Delete saved Key
                </button>
              )}
            </div>
            <p aria-live="polite" className="provider-status" role="status">
              {status}
            </p>
          </form>
        </div>
      )}
    </section>
  );
}

function replaceProvider(
  providers: readonly ProviderPublic[],
  replacement: ProviderPublic,
): readonly ProviderPublic[] {
  const existing = providers.findIndex(({ id }) => id === replacement.id);
  if (existing < 0) return [...providers, replacement];
  return providers.map((provider) =>
    provider.id === replacement.id ? replacement : provider,
  );
}

function providerErrorMessage(code: ProviderErrorCode): string {
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
