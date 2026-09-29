import { Button, EmptyState } from "@cyberforge/ui";
import { Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <EmptyState
      className="mt-10"
      icon={<Compass />}
      title="Not found"
      description="That page, lab, rule or alert does not exist on this instance. It may have been removed, or the link is wrong."
      action={
        <Button asChild>
          <Link href="/">Back to the dashboard</Link>
        </Button>
      }
    />
  );
}
