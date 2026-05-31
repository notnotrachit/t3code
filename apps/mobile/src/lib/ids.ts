import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";

function randomUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const newCommandId = () => CommandId.make(randomUUID());
export const newMessageId = () => MessageId.make(randomUUID());
export const newThreadId = () => ThreadId.make(randomUUID());
