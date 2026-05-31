import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Drawer } from "react-native-drawer-layout";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  ClientOrchestrationCommand,
  ModelSelection,
  OrchestrationProjectShell,
  OrchestrationThreadShell,
  ProviderInteractionMode,
  ServerProvider,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";

import { useEnvironmentSession } from "../hooks/useEnvironmentSession";
import { useThreadDetail } from "../hooks/useThreadDetail";
import { useSavedEnvironments } from "../hooks/useSavedEnvironments";
import { newCommandId, newMessageId, newThreadId } from "../lib/ids";
import { resolveDefaultModelSelection } from "../lib/providers";
import { Composer } from "../components/Composer";
import { ModelPicker } from "../components/ModelPicker";
import { ThreadTimeline } from "../components/ThreadTimeline";
import { ThreadActions } from "../components/ThreadActions";
import { colors, spacing } from "../theme";
import type { SavedEnvironmentRecord } from "../types";
import type { WorkspaceScreenProps } from "../navigation/types";
import type { WsRpcClient } from "../lib/wsRpcClient";

const EMPTY_THREADS: readonly OrchestrationThreadShell[] = [];
const EMPTY_PROJECTS: readonly OrchestrationProjectShell[] = [];
const SCREEN_WIDTH = Dimensions.get("window").width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 320);
const DEFAULT_RUNTIME_MODE: RuntimeMode = "full-access";
const DEFAULT_INTERACTION_MODE: ProviderInteractionMode = "default";

export function WorkspaceScreen({ navigation, route }: WorkspaceScreenProps) {
  const { environments } = useSavedEnvironments();
  const environment = environments.find((e) => e.environmentId === route.params.environmentId);
  if (!environment) {
    return (
      <View style={s.screen}>
        <View style={s.centered}>
          <Text style={s.muted}>Environment not found</Text>
        </View>
      </View>
    );
  }
  return <WorkspaceContent environment={environment} onBack={() => navigation.goBack()} />;
}

function WorkspaceContent({
  environment,
  onBack,
}: {
  environment: SavedEnvironmentRecord;
  onBack: () => void;
}) {
  const { state, client } = useEnvironmentSession(environment);
  const [selectedThreadId, setSelectedThreadId] = useState<ThreadId | null>(null);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [newPrompt, setNewPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(DEFAULT_RUNTIME_MODE);
  const [interactionMode, setInteractionMode] =
    useState<ProviderInteractionMode>(DEFAULT_INTERACTION_MODE);
  const [draftModelSelection, setDraftModelSelection] = useState<ModelSelection | null>(null);
  const [keyboardResetKey, setKeyboardResetKey] = useState(0);

  const open = () => setDrawerOpen(true);
  const close = () => setDrawerOpen(false);

  const shell = state.shellSnapshot;
  const projects = shell?.projects ?? EMPTY_PROJECTS;
  const threads = shell?.threads ?? EMPTY_THREADS;
  const providers = state.serverConfig?.providers ?? [];

  const grouped = useMemo(() => {
    const m = new Map<string, OrchestrationThreadShell[]>();
    for (const t of threads) {
      const a = m.get(t.projectId) ?? [];
      a.push(t);
      m.set(t.projectId, a);
    }
    return m;
  }, [threads]);

  useEffect(() => {
    if (selectedThreadId && threads.some((t) => t.id === selectedThreadId)) return;
    setSelectedThreadId(threads[0]?.id ?? null);
  }, [selectedThreadId, threads]);

  const project = projects[0] ?? null;
  const draftProject = draftProjectId ? projects.find((p) => p.id === draftProjectId) : null;
  const sel = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? null,
    [selectedThreadId, threads],
  );
  const { thread, error: threadErr } = useThreadDetail(
    client,
    selectedThreadId,
    sel?.latestTurn?.state,
  );
  const composerModelSelection =
    draftProjectId && state.serverConfig && draftProject
      ? (draftModelSelection ?? resolveDefaultModelSelection(state.serverConfig, draftProject))
      : (sel?.modelSelection ?? null);

  useEffect(() => {
    if (Platform.OS === "ios") return;
    const subscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardResetKey((key) => key + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (draftProjectId) {
      setRuntimeMode(DEFAULT_RUNTIME_MODE);
      setInteractionMode(DEFAULT_INTERACTION_MODE);
      setDraftModelSelection(null);
      return;
    }

    setRuntimeMode(sel?.runtimeMode ?? DEFAULT_RUNTIME_MODE);
    setInteractionMode(sel?.interactionMode ?? DEFAULT_INTERACTION_MODE);
  }, [draftProjectId, sel?.interactionMode, sel?.runtimeMode]);

  const handleRuntimeModeChange = async (nextRuntimeMode: RuntimeMode) => {
    setRuntimeMode(nextRuntimeMode);
    if (!client || !selectedThreadId || draftProjectId) return;
    try {
      await client.orchestration.dispatchCommand({
        type: "thread.runtime-mode.set",
        commandId: newCommandId(),
        threadId: selectedThreadId,
        runtimeMode: nextRuntimeMode,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update runtime mode");
    }
  };

  const handleInteractionModeChange = async (nextInteractionMode: ProviderInteractionMode) => {
    setInteractionMode(nextInteractionMode);
    if (!client || !selectedThreadId || draftProjectId) return;
    try {
      await client.orchestration.dispatchCommand({
        type: "thread.interaction-mode.set",
        commandId: newCommandId(),
        threadId: selectedThreadId,
        interactionMode: nextInteractionMode,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update interaction mode");
    }
  };

  const handleCreate = async () => {
    if (!client || !project || !state.serverConfig || !newPrompt.trim()) return;
    setCreating(true);
    try {
      const id = newThreadId();
      const now = new Date().toISOString();
      const ms = resolveDefaultModelSelection(state.serverConfig, project);
      const title = newPrompt.trim().split("\n")[0]?.slice(0, 80) || "New thread";
      await client.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: id,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: newPrompt.trim(),
          attachments: [],
        },
        modelSelection: ms,
        titleSeed: title,
        runtimeMode: "full-access" satisfies RuntimeMode,
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId: project.id,
            title,
            modelSelection: ms,
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt: now,
          },
        },
        createdAt: now,
      } as ClientOrchestrationCommand);
      setNewPrompt("");
      setSelectedThreadId(id);
      close();
    } catch (_) {}
    setCreating(false);
  };

  const handleSend = async () => {
    if (!client) return;
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      if (draftProjectId) {
        // Create new thread with first message
        const id = newThreadId();
        const now = new Date().toISOString();
        const ms =
          draftModelSelection ??
          resolveDefaultModelSelection(state.serverConfig!, { id: draftProjectId } as any);
        const title = text.split("\n")[0]?.slice(0, 80) || "New thread";
        await client.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: id,
          message: { messageId: newMessageId(), role: "user", text, attachments: [] },
          modelSelection: ms,
          titleSeed: title,
          runtimeMode,
          interactionMode,
          bootstrap: {
            createThread: {
              projectId: draftProjectId,
              title,
              modelSelection: ms,
              runtimeMode,
              interactionMode,
              branch: null,
              worktreePath: null,
              createdAt: now,
            },
          },
          createdAt: now,
        } as any);
        setSelectedThreadId(id);
        setDraftProjectId(null);
      } else if (selectedThreadId) {
        await client.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: selectedThreadId,
          message: { messageId: newMessageId(), role: "user", text, attachments: [] },
          createdAt: new Date().toISOString(),
          runtimeMode,
          interactionMode,
        });
      }
      setReply("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    }
    setSending(false);
  };

  const handleStop = async () => {
    if (!client || !selectedThreadId) return;
    try {
      await client.orchestration.dispatchCommand({
        type: "thread.turn.interrupt",
        commandId: newCommandId(),
        threadId: selectedThreadId,
        ...(sel?.latestTurn?.turnId ? { turnId: sel.latestTurn.turnId } : {}),
        createdAt: new Date().toISOString(),
      });
    } catch (_) {}
  };

  const renderDrawer = () => (
    <SafeAreaView style={s.drawer} edges={["top"]}>
      <View style={s.dHeader}>
        <Text style={s.dTitle}>{environment.label}</Text>
        <View style={s.statusRow}>
          <View
            style={[s.dot, state.status === "connected" && state.shellReady ? s.dotG : s.dotR]}
          />
          <Text style={s.statusText}>{state.status}</Text>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {projects.map((p) => (
          <CollapsibleProject
            key={p.id}
            title={p.title}
            threads={grouped.get(p.id) ?? []}
            selectedThreadId={selectedThreadId}
            onSelect={(id) => {
              setSelectedThreadId(id);
              setDraftProjectId(null);
              close();
            }}
            projectId={p.id}
            client={client}
            serverConfig={state.serverConfig}
            onCreated={(projId) => {
              setSelectedThreadId(null);
              setDraftProjectId(projId as any);
              close();
            }}
          />
        ))}
      </ScrollView>
      <Pressable onPress={onBack} style={s.disc}>
        <Text style={s.discT}>← Disconnect</Text>
      </Pressable>
    </SafeAreaView>
  );

  return (
    <Drawer
      open={drawerOpen}
      onOpen={() => setDrawerOpen(true)}
      onClose={() => setDrawerOpen(false)}
      drawerType="front"
      drawerStyle={{ width: DRAWER_WIDTH, backgroundColor: colors.surface }}
      renderDrawerContent={renderDrawer}
      swipeEdgeWidth={SCREEN_WIDTH}
    >
      <SafeAreaView style={s.screen} edges={["top"]}>
        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={open} hitSlop={8}>
            <Text style={s.menu}>☰</Text>
          </Pressable>
          <Text numberOfLines={1} style={s.title}>
            {sel?.title ?? "T3 Code"}
          </Text>
          {sel?.latestTurn?.state === "running" ? (
            <Pressable onPress={() => void handleStop()} style={s.stopBtn}>
              <Text style={s.stopText}>■ Stop</Text>
            </Pressable>
          ) : selectedThreadId ? (
            <ThreadActions threadId={selectedThreadId} title={sel?.title ?? ""} client={client} />
          ) : null}
        </View>

        {/* Main */}
        <KeyboardAvoidingView
          key={Platform.OS === "ios" ? "ios-keyboard" : `android-keyboard-${keyboardResetKey}`}
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          contentContainerStyle={s.keyboardContent}
        >
          {!state.shellReady ? (
            <View style={s.centered}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={s.muted}>Connecting…</Text>
            </View>
          ) : draftProjectId ? (
            <View style={{ flex: 1 }}>
              <View style={s.centered}>
                <Text style={s.headerTitle}>New Thread</Text>
                <Text style={s.muted}>Type your first message below</Text>
              </View>
              <Composer
                value={reply}
                onChangeText={setReply}
                onSend={() => void handleSend()}
                sending={sending}
                disabled={!client}
                placeholder="Start a new thread…"
                controls={
                  <MobileComposerControls
                    providers={providers}
                    modelSelection={composerModelSelection}
                    client={client}
                    runtimeMode={runtimeMode}
                    interactionMode={interactionMode}
                    onRuntimeModeChange={(mode) => void handleRuntimeModeChange(mode)}
                    onInteractionModeChange={(mode) => void handleInteractionModeChange(mode)}
                    onDraftModelSelectionChange={setDraftModelSelection}
                  />
                }
              />
            </View>
          ) : !selectedThreadId ? (
            <View style={s.centered}>
              <Text style={s.muted}>No thread selected</Text>
              <Text style={s.hint}>Swipe right or tap ☰</Text>
            </View>
          ) : !thread ? (
            <View style={s.centered}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <ThreadTimeline
                messages={thread.messages}
                activities={thread.activities}
                checkpoints={thread.checkpoints}
                threadId={selectedThreadId}
                hasPendingApprovals={sel?.hasPendingApprovals}
                hasPendingUserInput={sel?.hasPendingUserInput}
                client={client}
              />
              <Composer
                value={reply}
                onChangeText={setReply}
                onSend={() => void handleSend()}
                sending={sending}
                disabled={!client}
                error={error ?? threadErr}
                placeholder={draftProjectId ? "Start a new thread…" : "Message…"}
                controls={
                  <MobileComposerControls
                    providers={providers}
                    modelSelection={composerModelSelection}
                    threadId={selectedThreadId}
                    client={client}
                    runtimeMode={runtimeMode}
                    interactionMode={interactionMode}
                    onRuntimeModeChange={(mode) => void handleRuntimeModeChange(mode)}
                    onInteractionModeChange={(mode) => void handleInteractionModeChange(mode)}
                  />
                }
              />
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Drawer>
  );
}

const RUNTIME_OPTIONS: readonly {
  value: RuntimeMode;
  label: string;
  shortLabel: string;
}[] = [
  { value: "approval-required", label: "Supervised", shortLabel: "Ask" },
  { value: "auto-accept-edits", label: "Auto edits", shortLabel: "Edit" },
  { value: "full-access", label: "Full access", shortLabel: "Full" },
];

const INTERACTION_OPTIONS: readonly {
  value: ProviderInteractionMode;
  label: string;
}[] = [
  { value: "default", label: "Build" },
  { value: "plan", label: "Plan" },
];

function MobileComposerControls({
  providers,
  modelSelection,
  threadId,
  client,
  runtimeMode,
  interactionMode,
  onRuntimeModeChange,
  onInteractionModeChange,
  onDraftModelSelectionChange,
}: {
  providers: readonly ServerProvider[];
  modelSelection: ModelSelection | null;
  threadId?: ThreadId;
  client: WsRpcClient | null;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onInteractionModeChange: (mode: ProviderInteractionMode) => void;
  onDraftModelSelectionChange?: (modelSelection: ModelSelection) => void;
}) {
  return (
    <View style={s.composerControls}>
      <View style={s.composerControlRow}>
        <Text style={s.composerControlLabel}>Model</Text>
        <ModelPicker
          providers={providers}
          currentModel={modelSelection?.model}
          threadId={threadId}
          client={client}
          onModelSelectionChange={onDraftModelSelectionChange}
        />
      </View>
      <View style={s.composerControlRow}>
        <View style={s.segment}>
          {INTERACTION_OPTIONS.map((option) => {
            const selected = interactionMode === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => onInteractionModeChange(option.value)}
                style={[s.segmentBtn, selected && s.segmentBtnSelected]}
              >
                <Text style={[s.segmentText, selected && s.segmentTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[s.segment, s.runtimeSegment]}>
          {RUNTIME_OPTIONS.map((option) => {
            const selected = runtimeMode === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => onRuntimeModeChange(option.value)}
                style={[s.segmentBtn, selected && s.segmentBtnSelected]}
              >
                <Text style={[s.segmentText, selected && s.segmentTextSelected]} numberOfLines={1}>
                  {option.shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function CollapsibleProject({
  title,
  threads,
  selectedThreadId,
  onSelect,
  projectId,
  client,
  serverConfig,
  onCreated,
}: {
  title: string;
  threads: OrchestrationThreadShell[];
  selectedThreadId: ThreadId | null;
  onSelect: (id: ThreadId) => void;
  projectId: string;
  client: WsRpcClient | null;
  serverConfig: any;
  onCreated: (id: ThreadId) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <View style={s.group}>
      <Pressable onPress={() => setCollapsed(!collapsed)} style={s.groupHeader}>
        <Text style={s.groupChevron}>{collapsed ? "▸" : "▾"}</Text>
        <Text style={s.groupL}>{title}</Text>
        <Text style={s.groupCount}>{threads.length}</Text>
        <Pressable onPress={() => onCreated(projectId as any)} hitSlop={8}>
          <Text style={s.newBtnInline}>＋</Text>
        </Pressable>
      </Pressable>
      {!collapsed &&
        threads.map((t) => {
          const active = t.id === selectedThreadId;
          return (
            <Pressable
              key={t.id}
              onPress={() => onSelect(t.id)}
              style={[s.item, active && s.itemA]}
            >
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[s.itemT, active && s.itemTA]}>
                  {t.title}
                </Text>
                <Text style={s.itemM}>
                  {t.modelSelection.model ?? "auto"}
                  {t.latestTurn?.state === "running" ? " · ⏳" : ""}
                </Text>
              </View>
              {(t.hasPendingApprovals || t.hasPendingUserInput) && <View style={s.badge} />}
            </Pressable>
          );
        })}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  keyboardContent: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  muted: { color: colors.textMuted, fontSize: 16 },
  hint: { color: colors.textMuted, fontSize: 13 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  menu: { color: colors.text, fontSize: 22 },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: "700" },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  stopBtn: {
    backgroundColor: colors.danger,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stopText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  composerControls: { gap: spacing.sm },
  composerControlRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  composerControlLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    padding: 2,
  },
  runtimeSegment: { flex: 1 },
  segmentBtn: {
    minHeight: 28,
    flex: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  segmentBtnSelected: { backgroundColor: colors.surfaceRaised },
  segmentText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  segmentTextSelected: { color: colors.text },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  drawer: { flex: 1, backgroundColor: colors.surface },
  dHeader: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  dTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotG: { backgroundColor: colors.success },
  dotR: { backgroundColor: colors.textMuted },
  statusText: { color: colors.textMuted, fontSize: 12 },
  newBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  newInput: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  newBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  newBtnL: { color: "#fff", fontSize: 20, fontWeight: "700" },
  newInProject: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  newInProjectInput: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  newInProjectBtn: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  group: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  groupChevron: { color: colors.textMuted, fontSize: 11 },
  groupL: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  groupCount: { color: colors.textMuted, fontSize: 11 },
  newBtnInline: { color: colors.accent, fontSize: 18, fontWeight: "700" },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  itemA: { backgroundColor: colors.sidebarSelected },
  itemT: { color: colors.text, fontSize: 14, fontWeight: "500" },
  itemTA: { fontWeight: "700", color: colors.accent },
  itemM: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  badge: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  disc: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  discT: { color: colors.danger, fontWeight: "600" },
});
