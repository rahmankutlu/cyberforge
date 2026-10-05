import { Fragment, type ReactNode } from "react";

/** Renders the content of one `<tag>…</tag>` pair found in a translated message. */
export type RichTags = Readonly<Record<string, (content: string) => ReactNode>>;

const TAG_PATTERN = /<(\w+)>([\s\S]*?)<\/\1>/g;

/**
 * Turns a translated message with inline `<tag>text</tag>` markers into React nodes.
 *
 * Messages that contain links or emphasis must stay one sentence, because Turkish word order
 * and suffixes cannot be assembled from English fragments. Translators move the tags freely;
 * unknown tags fall back to their plain text so a typo never drops content.
 */
export function renderRich(message: string, tags: RichTags): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of message.matchAll(TAG_PATTERN)) {
    const [whole, name, content] = match;
    if (match.index > cursor) nodes.push(message.slice(cursor, match.index));
    const render = Object.hasOwn(tags, name) ? tags[name] : undefined;
    nodes.push(<Fragment key={nodes.length}>{render ? render(content) : content}</Fragment>);
    cursor = match.index + whole.length;
  }
  if (cursor < message.length) nodes.push(message.slice(cursor));
  return nodes;
}
