import type { DocPage } from "@cyberforge/types";
import { notFound } from "next/navigation";

import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { apiGetOrNull } from "@/lib/api";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const doc = await apiGetOrNull<DocPage>(`/docs-pages/${slug}`).catch(() => null);
  return { title: doc?.title ?? "Documentation" };
}

export default async function DocPageRoute({ params }: Props) {
  const { slug } = await params;
  const doc = await apiGetOrNull<DocPage>(`/docs-pages/${slug}`);
  if (!doc) notFound();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Documentation", href: "/docs" }, { label: doc.title }]}
        title={doc.title}
        description={<span className="font-mono text-xs">{doc.path}</span>}
      />
      <article className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-6 sm:p-8">
        <Markdown>{doc.markdown}</Markdown>
      </article>
    </>
  );
}
