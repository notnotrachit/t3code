import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Random from "effect/Random";

function randomUUID(): string {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Effect.runSync(Random.nextUUIDv4);
}

export const newCommandId = () => CommandId.make(randomUUID());
export const newMessageId = () => MessageId.make(randomUUID());
export const newThreadId = () => ThreadId.make(randomUUID());
