"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
import { client } from "@/services/api";
import type { Feedback } from "@/types/api";
import { formatReadableDateTime, securityLabel, textDirectionClass, cn } from "@/lib/utils";

export default function FeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    client.myFeedback().then(setItems).catch(() => setMessage("Unable to load feedback"));
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-black text-white">Feedback</h1>
        <p className="mt-2 text-slate-400">Review the status of corrections submitted from analysis results.</p>
      </div>
      {message && <Card className="border-amber/40 text-amber-200">{message}</Card>}
      <div className="grid gap-4">
        {items.length === 0 && (
          <EmptyState
            icon={<MessageSquare className="h-5 w-5" />}
            title="No feedback submitted yet"
            description="Submit corrections from an analysis result when you believe the verdict needs review."
            action={<Link href="/history"><Button variant="secondary">View Analysis History</Button></Link>}
          />
        )}
        {items.map((item) => (
          <Card key={item.id}>
            <div className="flex flex-col justify-between gap-3 md:flex-row">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge>Analysis {shortId(item.analysis_id)}</Badge>
                  <Badge>{securityLabel(item.feedback_type)}</Badge>
                  <StatusChip value={item.status} />
                  {item.suggested_label && <Badge>Proposed: {securityLabel(item.suggested_label)}</Badge>}
                </div>
                <p className={cn("mt-3 text-sm text-slate-400", textDirectionClass(item.notes || ""))}>{item.notes || "No notes supplied"}</p>
                <p className="mt-1 text-xs text-slate-500">Submitted {formatReadableDateTime(item.created_at)}</p>
              </div>
              <Link className="text-cyan hover:text-cyan/80" href={`/analyses/${item.analysis_id}`}>Open analysis</Link>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function shortId(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
}
