import { SplitPaneShell } from "@/components/layout/split-pane-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const rows = [
  { metric: "Spend", value: "$12,430", change: "+5.8%" },
  { metric: "ROAS", value: "2.6x", change: "+0.4" },
  { metric: "CTR", value: "1.9%", change: "-0.2%" },
];

export default function AnalyticsPage() {
  return (
    <SplitPaneShell
      rightPane={
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Analytics Pane</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pb-2">Metric</th>
                  <th className="pb-2">Value</th>
                  <th className="pb-2">Delta</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.metric} className="border-t border-border">
                    <td className="py-2">{row.metric}</td>
                    <td className="py-2">{row.value}</td>
                    <td className="py-2 text-muted-foreground">{row.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      }
    />
  );
}
