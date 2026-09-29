import type { DocSummary } from "@cyberforge/types";
import { Card } from "@cyberforge/ui";
import { FileText } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { apiGet } from "@/lib/api";

export const metadata = { title: "Documentation" };

const ORDER = [
  "getting-started",
  "architecture",
  "labs",
  "detections",
  "mitre",
  "ai-security",
  "security-model",
  "contributing-labs",
];

export default async function DocsPage() {
  const docs = await apiGet<DocSummary[]>("/docs-pages");
  const sorted = [...docs].sort((a, b) => {
    const ai = ORDER.indexOf(a.slug);
    const bi = ORDER.indexOf(b.slug);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.title.localeCompare(b.title);
  });
  return (
    <>
      <PageHeader
        title="Documentation"
        description="Guides for running, extending and securely operating CyberForge. The same files live in the repository's docs folder."
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((doc) => (
          <li key={doc.slug}>
            <Link
              href={`/docs/${doc.slug}`}
              className="block h-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-primary/40">
                <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{doc.title}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {doc.path}
                  </p>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
