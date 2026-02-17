import { SplitPaneShell } from "@/components/layout/split-pane-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ChatRoutePage() {
  return (
    <SplitPaneShell
      rightPane={
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Conversation Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Route: <code>/chat</code></p>
            <p>
              Intended for context cards (active ad account, selected campaigns, and action queue)
              that accompany the left-side assistant thread.
            </p>
          </CardContent>
        </Card>
      }
    />
  );
}
