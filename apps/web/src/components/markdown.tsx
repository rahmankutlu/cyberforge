import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Map repository-relative doc links (../docs/labs.md, labs.md) to in-app /docs pages. */
export function resolveDocHref(href: string): { href: string; external: boolean } {
  if (/^https?:\/\//i.test(href) || href.startsWith("mailto:")) return { href, external: true };
  if (href.startsWith("#") || href.startsWith("/")) return { href, external: false };
  const match = href.match(/(?:^|\/)([A-Za-z0-9_-]+)\.md(#.*)?$/);
  if (match?.[1])
    return { href: `/docs/${match[1].toLowerCase()}${match[2] ?? ""}`, external: false };
  return { href, external: false };
}

const components: Components = {
  a({ href = "", children }) {
    const target = resolveDocHref(href);
    if (target.external) {
      return (
        <a href={target.href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    }
    return <Link href={target.href}>{children}</Link>;
  },
  // Untrusted HTML is never rendered: react-markdown escapes it by default and we do not enable rehype-raw.
  img() {
    return null;
  },
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`prose-cf ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
