import Link from "next/link";
import { BarChart3, MessageSquareText } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SplitPaneShell({
  rightPane,
}: {
  rightPane: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-7xl gap-4 md:gap-6">
        <Card className="flex w-full min-w-[320px] flex-col md:w-5/12">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Agent Chat</CardTitle>
              <div className="flex gap-2">
                <Link href="/chat" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  <MessageSquareText className="mr-1 h-4 w-4" /> Chat
                </Link>
                <Link href="/analytics" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  <BarChart3 className="mr-1 h-4 w-4" /> Analytics
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 pt-4">
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Ask the assistant for campaign analysis, budget pacing checks, or creative performance insights.
            </div>
            <textarea
              aria-label="chat input"
              className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
              placeholder="Type a prompt for the ads assistant..."
            />
            <Button className="self-end">Send</Button>
          </CardContent>
        </Card>

        <section className="hidden min-w-0 flex-1 md:block">{rightPane}</section>
      </div>
    </main>
  );
}
