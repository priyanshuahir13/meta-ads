import { SplitPaneShell } from "@/components/layout/split-pane-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <SplitPaneShell
      rightPane={
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Dynamic Pane</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              The right pane loads route-specific content, including chat context details, analytics
              views, and future execution traces.
            </p>
            <p>Use the navigation buttons in the chat header to switch between app routes.</p>
          </CardContent>
        </Card>
      }
    />
  );
}
