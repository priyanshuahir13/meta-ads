import { SplitPaneShell } from '@/components/layout/split-pane-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ChatRoutePage() {
  return (
    <SplitPaneShell
      rightPane={
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Conversation Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Draft-first mode is enabled: every generated proposal must be Previewed and Approved
              before publish is allowed.
            </p>
            <p>
              Each publish request is checked against backend budget caps and approval token/hash
              guardrails.
            </p>
          </CardContent>
        </Card>
      }
    />
  );
}
