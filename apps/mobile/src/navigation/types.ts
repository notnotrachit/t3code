import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Home: { scannedUrl?: string } | undefined;
  Workspace: { environmentId: string };
  QRScan: undefined;
};

export type HomeScreenProps = NativeStackScreenProps<RootStackParamList, "Home">;
export type WorkspaceScreenProps = NativeStackScreenProps<RootStackParamList, "Workspace">;
export type QRScanScreenProps = NativeStackScreenProps<RootStackParamList, "QRScan">;
