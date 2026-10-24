import type { ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card';

/** Wraps a chart with a title and a text summary for assistive tech; always labelled as local data. */
export function ChartCard({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description="Operational overview" />
      <CardBody>
        <div role="img" aria-label={`${title}. ${summary}`} className="h-64 w-full">{children}</div>
        <p className="sr-only">{summary}</p>
      </CardBody>
    </Card>
  );
}
