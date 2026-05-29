import type {
  AuthSessionRole,
  ExecutionEnvironmentDescriptor,
  OrchestrationShellSnapshot,
  ServerConfig,
} from "@t3tools/contracts";

export interface SavedEnvironmentRecord {
  readonly environmentId: string;
  readonly label: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly createdAt: string;
  readonly lastConnectedAt: string | null;
}

export type SessionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "disconnected";

export interface EnvironmentSessionState {
  readonly status: SessionStatus;
  readonly shellReady: boolean;
  readonly error: string | null;
  readonly role: AuthSessionRole | null;
  readonly descriptor: ExecutionEnvironmentDescriptor | null;
  readonly serverConfig: ServerConfig | null;
  readonly shellSnapshot: OrchestrationShellSnapshot | null;
}

export interface AddEnvironmentInput {
  readonly label: string;
  readonly pairingUrl?: string;
  readonly host?: string;
  readonly pairingCode?: string;
}
