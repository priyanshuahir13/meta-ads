'use client';

import { useMemo, useState } from 'react';

import { SplitPaneShell } from '@/components/layout/split-pane-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const dataByRange = {
  '7d': [
    { metric: 'Spend', value: 12430, delta: 5.8 },
    { metric: 'ROAS', value: 2.6, delta: 0.4 },
    { metric: 'CTR', value: 1.9, delta: -0.2 },
  ],
  '30d': [
    { metric: 'Spend', value: 53200, delta: 8.9 },
    { metric: 'ROAS', value: 2.3, delta: 0.3 },
    { metric: 'CTR', value: 1.7, delta: -0.1 },
  ],
} as const;

export default function AnalyticsPage() {
  const [range, setRange] = useState<keyof typeof dataByRange>('7d');
  const rows = useMemo(() => dataByRange[range], [range]);
  const maxValue = Math.max(...rows.map((item) => item.value));

  return (
    <SplitPaneShell
      rightPane={
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Analytics Pane ({range})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 text-xs">
              <button onClick={() => setRange('7d')} className="rounded border px-2 py-1">7D</button>
              <button onClick={() => setRange('30d')} className="rounded border px-2 py-1">30D</button>
            </div>
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.metric} className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{row.metric}</span>
                    <span>{row.value}</span>
                  </div>
                  <div className="h-2 rounded bg-muted">
                    <div className="h-2 rounded bg-primary" style={{ width: `${(row.value / maxValue) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      }
    />
  );
}
