import { useEffect, useMemo, useRef } from "react";
import { FlatList } from "react-native";
import type {
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
  OrchestrationThreadActivity,
  ThreadId,
} from "@t3tools/contracts";
import { MessageBubble } from "./MessageBubble";
import { ToolCallCard } from "./ToolCallCard";
import { ApprovalCard } from "./ApprovalCard";
import { UserInputCard } from "./UserInputCard";
import { spacing } from "../theme";
import type { WsRpcClient } from "../lib/wsRpcClient";

type TimelineItem =
  | { type: "message"; data: OrchestrationMessage; key: string; ts: string }
  | { type: "activity"; data: OrchestrationThreadActivity; key: string; ts: string };

// Only show these activity kinds as cards — skip system noise
const VISIBLE_ACTIVITY_KINDS = new Set([
  "approval.requested",
  "approval.resolved",
  "user-input.requested",
  "user-input.resolved",
  "item.started",
  "item.updated",
  "item.completed",
]);

function isVisibleActivity(a: OrchestrationThreadActivity): boolean {
  // Show approval and user-input activities
  if (a.kind.startsWith("approval") || a.kind.startsWith("user-input")) return true;
  // Show tool activities (file edits, commands) but not system noise
  if (a.kind === "item.started" || a.kind === "item.updated" || a.kind === "item.completed") {
    // Filter out system events like context_window, checkpoint, etc.
    const summary = a.summary?.toLowerCase() ?? "";
    if (
      summary.includes("context window") ||
      summary.includes("checkpoint") ||
      summary.includes("session")
    )
      return false;
    return true;
  }
  return false;
}

interface ThreadTimelineProps {
  messages: readonly OrchestrationMessage[];
  activities: readonly OrchestrationThreadActivity[];
  checkpoints: readonly OrchestrationCheckpointSummary[];
  threadId: ThreadId;
  hasPendingApprovals?: boolean;
  hasPendingUserInput?: boolean;
  client: WsRpcClient | null;
}

export function ThreadTimeline({
  messages,
  activities,
  threadId,
  hasPendingApprovals,
  hasPendingUserInput,
  client,
}: ThreadTimelineProps) {
  const flatListRef = useRef<FlatList>(null);
  const prevCountRef = useRef(0);

  const items = useMemo<TimelineItem[]>(() => {
    const all: TimelineItem[] = [
      ...messages.map((m) => ({
        type: "message" as const,
        data: m,
        key: `msg-${m.id}`,
        ts: m.createdAt,
      })),
      ...activities
        .filter(isVisibleActivity)
        .map((a) => ({ type: "activity" as const, data: a, key: `act-${a.id}`, ts: a.createdAt })),
    ];
    return all.sort((a, b) => a.ts.localeCompare(b.ts));
  }, [messages, activities]);

  // Auto-scroll only when new items are added (not on re-render)
  useEffect(() => {
    if (items.length > prevCountRef.current && items.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
    prevCountRef.current = items.length;
  }, [items.length]);

  const renderItem = ({ item }: { item: TimelineItem }) => {
    switch (item.type) {
      case "message":
        return (
          <MessageBubble
            role={item.data.role as "user" | "assistant"}
            text={item.data.text}
            streaming={item.data.streaming}
            meta={item.data.updatedAt}
          />
        );
      case "activity": {
        const a = item.data;
        if (a.kind === "approval.requested") {
          return (
            <ApprovalCard
              threadId={threadId}
              requestId={a.id}
              summary={a.summary}
              kind={a.kind}
              pending={!!hasPendingApprovals}
              client={client}
            />
          );
        }
        if (a.kind === "user-input.requested") {
          return (
            <UserInputCard
              threadId={threadId}
              requestId={a.id}
              question={a.summary}
              pending={!!hasPendingUserInput}
              client={client}
            />
          );
        }
        return (
          <ToolCallCard summary={a.summary} kind={a.kind} status={a.status} detail={a.detail} />
        );
      }
    }
  };

  return (
    <FlatList
      ref={flatListRef}
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      scrollEventThrottle={16}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl }}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
    />
  );
}
