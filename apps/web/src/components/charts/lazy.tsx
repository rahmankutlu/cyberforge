"use client";

import { Skeleton } from "@cyberforge/ui";
import dynamic from "next/dynamic";

/** Charts pull in a sizeable library, so they load on demand and never block first paint. */
export const TimelineChart = dynamic(() => import("./timeline-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-56 w-full" />,
});
