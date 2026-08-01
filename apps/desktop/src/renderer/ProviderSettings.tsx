import type {
  ProviderConnectionTestSnapshot,
  ProviderErrorCode,
  ProviderFailureReason,
  ProviderPublic,
} from "@ai-corporation/protocols";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { providerErrorMessage } from "./provider-settings-view-model";
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
  const [activeTestRequestId, setActiveTestRequestId] = useState<string>();
  const [connectionError, setConnectionError] = useState<string>();
  const [endpointError, setEndpointError] = useState<string>();
  const [showConnectionDiagnostic, setShowConnectionDiagnostic] =
    useState(false);
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
    setConnectionError(undefined);
    setShowConnectionDiagnostic(false);
    setEndpointError(undefined);
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
    setConnectionError(undefined);
    setShowConnectionDiagnostic(false);
    setEndpointError(undefined);
  };

  const testConnection = async () => {
    if (editing === undefined || activeTestRequestId !== undefined) return;
    const requestId = createUuidV7();
    setActiveTestRequestId(requestId);
    setConnectionError(undefined);
    setShowConnectionDiagnostic(false);
    setStatus("Testing the saved Endpoint and Key…");
    const diagnosticTimer = window.setTimeout(
      () => setShowConnectionDiagnostic(true),
      10_000,
    );
    try {
      const result = await window.desktop.provider.testConnection({
        schemaVersion: 1,
        requestId,
        providerId: editing.id,
        expectedVersion: editing.version,
      });
      if (!result.ok) {
        if (result.error.code === "CANCELLED") {
          setStatus(
            "Connection test cancelled. The previous result is unchanged.",
          );
        } else {
          setConnectionError(connectionOperationMessage(result.error.code));
          setStatus("");
        }
        return;
      }
      const updated = { ...editing, connectionTest: result.value };
      setEditing(updated);
      setProviders((current) => replaceProvider(current, updated));
      setStatus(
        result.value.status === "VERIFIED"
          ? `Connection verified. ${result.value.models.length} model${result.value.models.length === 1 ? "" : "s"} found.`
          : connectionFailureMessage(result.value.failure.reason),
      );
    } catch {
      setConnectionError(
        "The connection test could not be completed. Retry from Settings.",
      );
      setStatus("");
    } finally {
      window.clearTimeout(diagnosticTimer);
      setActiveTestRequestId(undefined);
      setShowConnectionDiagnostic(false);
    }
  };

  const cancelConnectionTest = async () => {
    if (activeTestRequestId === undefined) return;
    try {
      const result = await window.desktop.provider.cancelConnectionTest({
        schemaVersion: 1,
        requestId: activeTestRequestId,
      });
      if (!result.ok && result.error.code !== "NOT_FOUND") {
        setConnectionError(
          "The connection test cancellation could not be confirmed.",
        );
      }
    } catch {
      setConnectionError(
        "The connection test cancellation could not be confirmed.",
      );
    }
  };

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(undefined);
    setStatus("");
    if (field === "endpoint") setEndpointError(undefined);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const endpointValidationError = validateProviderEndpointForUi(
      form.endpoint,
    );
    if (endpointValidationError !== undefined) {
      setEndpointError(endpointValidationError);
      return;
    }
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

            {connectionError !== undefined && (
              <div className="provider-error" role="alert">
                <strong>Connection test was not completed.</strong>
                <p>{connectionError}</p>
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
                aria-describedby={
                  endpointError === undefined
                    ? undefined
                    : "provider-endpoint-error"
                }
                aria-invalid={endpointError === undefined ? undefined : true}
                autoComplete="url"
                maxLength={2_048}
                onChange={(event) => update("endpoint", event.target.value)}
                onBlur={() =>
                  setEndpointError(validateProviderEndpointForUi(form.endpoint))
                }
                required
                type="url"
                value={form.endpoint}
              />
              {endpointError !== undefined && (
                <small id="provider-endpoint-error" role="alert">
                  {endpointError}
                </small>
              )}
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
            {editing !== undefined && (
              <ConnectionTestPanel
                diagnostic={showConnectionDiagnostic}
                onCancel={() => void cancelConnectionTest()}
                onTest={() => void testConnection()}
                snapshot={editing.connectionTest ?? { status: "UNVERIFIED" }}
                testing={activeTestRequestId !== undefined}
                testDisabled={
                  pending ||
                  !editing.hasKey ||
                  activeTestRequestId !== undefined
                }
              />
            )}
            <p aria-live="polite" className="provider-status" role="status">
              {status}
            </p>
          </form>
        </div>
      )}
    </section>
  );
}

function ConnectionTestPanel(props: {
  readonly diagnostic: boolean;
  readonly onCancel: () => void;
  readonly onTest: () => void;
  readonly snapshot: ProviderConnectionTestSnapshot;
  readonly testDisabled: boolean;
  readonly testing: boolean;
}) {
  return (
    <section
      aria-labelledby="provider-connection-title"
      className="provider-connection-panel"
    >
      <div>
        <p className="eyebrow">Connection test</p>
        <h3 id="provider-connection-title">
          {props.testing ? "Testing" : connectionLabel(props.snapshot)}
        </h3>
      </div>
      {props.testing ? (
        <>
          <p>The app is checking the saved Endpoint, Key and model list.</p>
          {props.diagnostic && (
            <p role="status">
              This is taking longer than 10 seconds. The request will time out
              after 15 seconds; you can cancel it now.
            </p>
          )}
          <button
            className="secondary-button"
            onClick={props.onCancel}
            type="button"
          >
            Cancel test
          </button>
        </>
      ) : (
        <>
          <ConnectionSnapshot snapshot={props.snapshot} />
          <button
            className="secondary-button"
            disabled={props.testDisabled}
            onClick={props.onTest}
            type="button"
          >
            Test connection
          </button>
        </>
      )}
    </section>
  );
}

function ConnectionSnapshot(props: {
  readonly snapshot: ProviderConnectionTestSnapshot;
}) {
  if (props.snapshot.status === "UNVERIFIED") {
    return (
      <p>Not verified. Save a Key, then test before using this Provider.</p>
    );
  }
  if (props.snapshot.status === "FAILED") {
    return (
      <p>
        {connectionFailureMessage(props.snapshot.failure.reason)} Tested{" "}
        {formatTestTime(props.snapshot.testedAt)}.
      </p>
    );
  }
  return (
    <div>
      <p>
        Verified {formatTestTime(props.snapshot.testedAt)}. Found{" "}
        {props.snapshot.models.length} model
        {props.snapshot.models.length === 1 ? "" : "s"}.
      </p>
      {props.snapshot.models.length > 0 && (
        <ul className="provider-model-list">
          {props.snapshot.models.map((model) => (
            <li key={model.id}>{model.id}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function connectionLabel(
  snapshot: ProviderConnectionTestSnapshot,
): string {
  if (snapshot.status === "VERIFIED") return "Verified";
  if (snapshot.status === "FAILED") return "Test failed";
  return "Not verified";
}

export function connectionFailureMessage(
  reason: ProviderFailureReason,
): string {
  const messages: Record<ProviderFailureReason, string> = {
    AUTHENTICATION:
      "Authentication failed. Check the saved Key and test again.",
    PERMISSION:
      "The Key lacks permission to list models. Check Provider access.",
    RATE_LIMIT: "The Provider rate-limited the test. Wait, then retry.",
    QUOTA_EXHAUSTED:
      "Provider quota is exhausted. Increase quota or use another Provider.",
    INVALID_REQUEST:
      "The Endpoint or request is invalid. Check the API base URL.",
    MODEL_NOT_FOUND:
      "The requested model is unavailable. Select another model.",
    CONTENT_FILTER:
      "The Provider rejected the request under its content policy.",
    TIMEOUT:
      "The Provider did not respond within 15 seconds. Check the network and retry.",
    NETWORK:
      "The Provider could not be reached. Check the network and Endpoint.",
    PROVIDER_INTERNAL:
      "The Provider returned an invalid response or internal error. Retry or inspect the Endpoint.",
    CANCELLED:
      "The connection test was cancelled. The previous result is unchanged.",
  };
  return messages[reason];
}

export function connectionOperationMessage(code: string): string {
  const messages: Record<string, string> = {
    NOT_FOUND: "The Provider no longer exists. Reload Settings.",
    CONFLICT:
      "The Provider changed during the test. Reload and test the current version.",
    MISSING_KEY: "No saved Key is available. Save a Key before testing.",
    ALREADY_TESTING: "This connection test is already running.",
    VAULT_KEY_UNAVAILABLE:
      "The app-managed local encryption key is unavailable. Restore it or replace the Provider Key.",
    VAULT_INTEGRITY_FAILED:
      "The saved Key could not be authenticated. Delete it and enter the Key again.",
    STORAGE_UNAVAILABLE:
      "The connection result could not be stored. No success was recorded; retry.",
  };
  return (
    messages[code] ??
    "The connection test could not be completed safely. Retry from Settings."
  );
}

export function validateProviderEndpointForUi(
  endpoint: string,
): string | undefined {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return "Enter a valid HTTP(S) API base URL.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Only HTTP(S) API base URLs are supported.";
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return "Remove URL credentials, query parameters, and fragments from the Endpoint.";
  }
  if (
    url.protocol === "http:" &&
    !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/iu.test(
      endpoint,
    )
  ) {
    return "Remote Endpoints must use HTTPS. HTTP is allowed only for exact loopback addresses.";
  }
  return undefined;
}

function formatTestTime(value: string): string {
  return new Date(value).toLocaleString();
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
