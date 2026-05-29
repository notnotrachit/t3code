import type {
  AuthBearerBootstrapResult,
  AuthPairingCredentialResult,
  AuthSessionState,
  AuthWebSocketTokenResult,
  ExecutionEnvironmentDescriptor,
} from "@t3tools/contracts";

interface RemoteAuthHttpError extends Error {
  readonly status: number;
}

class RemoteEnvironmentAuthHttpError extends Error implements RemoteAuthHttpError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RemoteEnvironmentAuthHttpError";
    this.status = status;
  }
}

function remoteEndpointUrl(httpBaseUrl: string, pathname: string): string {
  const url = new URL(httpBaseUrl);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function readRemoteAuthErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  const text = await response.text();
  if (!text) {
    return fallbackMessage;
  }

  try {
    const parsed = JSON.parse(text) as { readonly error?: string };
    if (typeof parsed.error === "string" && parsed.error.length > 0) {
      return parsed.error;
    }
  } catch {
    return text;
  }

  return text;
}

async function fetchRemoteJson<T>(input: {
  readonly httpBaseUrl: string;
  readonly pathname: string;
  readonly method?: "GET" | "POST";
  readonly bearerToken?: string;
  readonly body?: unknown;
}): Promise<T> {
  const requestUrl = remoteEndpointUrl(input.httpBaseUrl, input.pathname);
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: input.method ?? "GET",
      headers: {
        ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(input.bearerToken ? { authorization: `Bearer ${input.bearerToken}` } : {}),
      },
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    });
  } catch (error) {
    throw new Error(
      `Failed to reach ${requestUrl} (${error instanceof Error ? error.message : String(error)}).`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new RemoteEnvironmentAuthHttpError(
      await readRemoteAuthErrorMessage(response, `Remote request failed (${response.status}).`),
      response.status,
    );
  }

  return (await response.json()) as T;
}

export async function bootstrapRemoteBearerSession(input: {
  readonly httpBaseUrl: string;
  readonly credential: string;
}): Promise<AuthBearerBootstrapResult> {
  return fetchRemoteJson<AuthBearerBootstrapResult>({
    httpBaseUrl: input.httpBaseUrl,
    pathname: "/api/auth/bootstrap/bearer",
    method: "POST",
    body: { credential: input.credential },
  });
}

export async function fetchRemoteSessionState(input: {
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
}): Promise<AuthSessionState> {
  return fetchRemoteJson<AuthSessionState>({
    httpBaseUrl: input.httpBaseUrl,
    pathname: "/api/auth/session",
    bearerToken: input.bearerToken,
  });
}

export async function fetchRemoteEnvironmentDescriptor(input: {
  readonly httpBaseUrl: string;
}): Promise<ExecutionEnvironmentDescriptor> {
  return fetchRemoteJson<ExecutionEnvironmentDescriptor>({
    httpBaseUrl: input.httpBaseUrl,
    pathname: "/.well-known/t3/environment",
  });
}

export async function issueRemoteWebSocketToken(input: {
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
}): Promise<AuthWebSocketTokenResult> {
  return fetchRemoteJson<AuthWebSocketTokenResult>({
    httpBaseUrl: input.httpBaseUrl,
    pathname: "/api/auth/ws-token",
    method: "POST",
    bearerToken: input.bearerToken,
  });
}

export async function resolveRemoteWebSocketConnectionUrl(input: {
  readonly wsBaseUrl: string;
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
}): Promise<string> {
  const issued = await issueRemoteWebSocketToken({
    httpBaseUrl: input.httpBaseUrl,
    bearerToken: input.bearerToken,
  });
  const url = new URL(input.wsBaseUrl);
  url.searchParams.set("wsToken", issued.token);
  return url.toString();
}

export async function createRemotePairingCredential(input: {
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
  readonly label?: string;
}): Promise<AuthPairingCredentialResult> {
  return fetchRemoteJson<AuthPairingCredentialResult>({
    httpBaseUrl: input.httpBaseUrl,
    pathname: "/api/auth/pairing-token",
    method: "POST",
    bearerToken: input.bearerToken,
    body: input.label?.trim() ? { label: input.label.trim() } : {},
  });
}

export async function revokeRemotePairingLink(input: {
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
  readonly id: string;
}): Promise<void> {
  await fetchRemoteJson({
    httpBaseUrl: input.httpBaseUrl,
    pathname: "/api/auth/pairing-links/revoke",
    method: "POST",
    bearerToken: input.bearerToken,
    body: { id: input.id },
  });
}

export async function revokeRemoteClientSession(input: {
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
  readonly sessionId: string;
}): Promise<void> {
  await fetchRemoteJson({
    httpBaseUrl: input.httpBaseUrl,
    pathname: "/api/auth/clients/revoke",
    method: "POST",
    bearerToken: input.bearerToken,
    body: { sessionId: input.sessionId },
  });
}

export async function revokeRemoteOtherClientSessions(input: {
  readonly httpBaseUrl: string;
  readonly bearerToken: string;
}): Promise<void> {
  await fetchRemoteJson({
    httpBaseUrl: input.httpBaseUrl,
    pathname: "/api/auth/clients/revoke-others",
    method: "POST",
    bearerToken: input.bearerToken,
    body: {},
  });
}

export function isRemoteAuthHttpError(error: unknown): error is RemoteAuthHttpError {
  return error instanceof RemoteEnvironmentAuthHttpError;
}
