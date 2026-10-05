import { Button, EmptyState } from "@cyberforge/ui";
import { Compass } from "lucide-react";
import Link from "next/link";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";

export default async function NotFound() {
  const c = createCopyTranslator(await getLocale());
  return (
    <EmptyState
      className="mt-10"
      icon={<Compass />}
      title={c("Not found")}
      description={c(
        "That page, lab, rule or alert does not exist on this instance. It may have been removed, or the link is wrong.",
      )}
      action={
        <Button asChild>
          <Link href="/">{c("Back to the dashboard")}</Link>
        </Button>
      }
    />
  );
}
