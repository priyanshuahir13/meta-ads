'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, MessageSquareText } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ActionCard = {
  actionId: string;
  state: string;
  approvalToken: string | null;
  actions: {
    preview: { enabled: boolean };
    approve: { enabled: boolean };
    reject: { enabled: boolean };
    publish: { enabled: boolean; disabledReason: string | null };
  };
};

type Draft = {
  actionId: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
};

export function SplitPaneShell({ rightPane }: { rightPane: React.ReactNode }) {
  const [prompt, setPrompt] = useState('Create lead generation campaign ideas for IT support services');
  const [sessionId] = useState(() => `sess-${Math.random().toString(36).slice(2, 8)}`);
  const [log, setLog] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [cards, setCards] = useState<Record<string, ActionCard>>({});
  const [busy, setBusy] = useState(false);

  const canSend = useMemo(() => prompt.trim().length > 0 && !busy, [prompt, busy]);

  async function callCardApi(body: Record<string, unknown>) {
    const response = await fetch('/api/action-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, userId: 'local-user', ...body }),
    });
    return response.json();
  }

  async function sendPrompt() {
    setBusy(true);
    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'recommend_budget',
          payload: { prompt, objective: 'LEADS', budget: 28000, audience: 'managed_it_buyers' },
        }),
      });
      const json = await response.json();
      setLog((prev) => [...prev, `Agent: ${json.preview}`]);
      const nextDrafts = (json.drafts ?? []) as Draft[];
      setDrafts(nextDrafts);

      for (const draft of nextDrafts) {
        const create = await callCardApi({ op: 'create_draft', actionId: draft.actionId, payload: draft.payload });
        if (create.ok) {
          setCards((prev) => ({ ...prev, [draft.actionId]: create.card }));
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCardAction(draft: Draft, op: 'present_preview' | 'approve' | 'publish' | 'reject') {
    const current = cards[draft.actionId];
    const result = await callCardApi({
      op,
      actionId: draft.actionId,
      payload: draft.payload,
      approvedToken: current?.approvalToken ?? undefined,
    });

    if (result.ok) {
      setCards((prev) => ({ ...prev, [draft.actionId]: result.card }));
      setLog((prev) => [...prev, `${draft.title}: ${op} -> ${result.card.state}`]);
    } else {
      const reason = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
      setLog((prev) => [...prev, `${draft.title}: ${op} failed: ${reason}`]);
    }
  }

  return (
    <main className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-7xl gap-4 md:gap-6">
        <Card className="flex w-full min-w-[320px] flex-col md:w-5/12">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Agent Chat</CardTitle>
              <div className="flex gap-2">
                <Link href="/chat" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                  <MessageSquareText className="mr-1 h-4 w-4" /> Chat
                </Link>
                <Link href="/analytics" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                  <BarChart3 className="mr-1 h-4 w-4" /> Analytics
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 pt-4">
            <textarea
              aria-label="chat input"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button disabled={!canSend} onClick={sendPrompt} className="self-end">
              {busy ? 'Working...' : 'Generate Drafts'}
            </Button>

            <div className="space-y-2 overflow-y-auto rounded-md border border-border p-2 text-xs">
              {log.map((entry, index) => (
                <p key={`${entry}-${index}`} className="text-muted-foreground">
                  {entry}
                </p>
              ))}
            </div>

            <div className="space-y-2 overflow-y-auto">
              {drafts.map((draft) => {
                const card = cards[draft.actionId];
                return (
                  <div key={draft.actionId} className="rounded-md border border-border p-2 text-xs">
                    <p className="font-medium text-foreground">{draft.title}</p>
                    <p className="mb-2 text-muted-foreground">{draft.summary}</p>
                    <p className="mb-2 text-muted-foreground">State: {card?.state ?? 'draft_created'}</p>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="secondary" disabled={!card?.actions.preview.enabled} onClick={() => handleCardAction(draft, 'present_preview')}>
                        Preview
                      </Button>
                      <Button size="sm" variant="secondary" disabled={!card?.actions.approve.enabled} onClick={() => handleCardAction(draft, 'approve')}>
                        Approve
                      </Button>
                      <Button size="sm" variant="default" disabled={!card?.actions.publish.enabled} onClick={() => handleCardAction(draft, 'publish')}>
                        Publish
                      </Button>
                      <Button size="sm" variant="ghost" disabled={!card?.actions.reject.enabled} onClick={() => handleCardAction(draft, 'reject')}>
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <section className="hidden min-w-0 flex-1 md:block">{rightPane}</section>
      </div>
    </main>
  );
}
