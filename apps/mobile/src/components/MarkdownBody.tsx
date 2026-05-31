import { StyleSheet } from "react-native";
import Markdown from "react-native-markdown-display";
import { colors } from "../theme";

const markdownStyles = StyleSheet.create({
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  heading1: { color: colors.text, fontSize: 22, fontWeight: "700", marginVertical: 8 },
  heading2: { color: colors.text, fontSize: 19, fontWeight: "700", marginVertical: 6 },
  heading3: { color: colors.text, fontSize: 17, fontWeight: "700", marginVertical: 4 },
  paragraph: { marginVertical: 4 },
  link: { color: colors.accent },
  strong: { fontWeight: "700" },
  em: { fontStyle: "italic" },
  code_inline: {
    backgroundColor: colors.surfaceRaised,
    color: colors.accent,
    fontFamily: "monospace",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  fence: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
  },
  code_block: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
    fontFamily: "monospace",
    fontSize: 13,
    color: colors.text,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 12,
    marginVertical: 6,
    opacity: 0.85,
  },
  list_item: { marginVertical: 2 },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  hr: { backgroundColor: colors.border, height: 1, marginVertical: 12 },
  table: { borderColor: colors.border, borderWidth: 1, borderRadius: 6 },
  thead: { backgroundColor: colors.surfaceRaised },
  th: { padding: 8, color: colors.text, fontWeight: "700" },
  td: { padding: 8, color: colors.text, borderTopWidth: 1, borderTopColor: colors.border },
});

export function MarkdownBody(props: { content: string | null | undefined; streaming?: boolean }) {
  const text = props.content?.trim();
  if (!text) return null;
  return <Markdown style={markdownStyles}>{text}</Markdown>;
}
