import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { useAppState } from '../../hooks/useAppState';
import { EmptyState } from '../ui/misc';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number;
  className?: string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  caption: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
}

export function DataTable<T>({ rows, columns, rowKey, caption, initialSort, emptyTitle = 'Nothing to show', emptyHint, emptyAction }: Props<T>) {
  const { settings } = useAppState();
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const pageSize = settings.defaultPageSize;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = sv(a), y = sv(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, columns, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => { if (page > pages - 1) setPage(pages - 1); }, [page, pages]);
  const visible = sorted.slice(page * pageSize, page * pageSize + pageSize);

  const toggle = (key: string) => setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const pad = settings.compactTables ? 'px-3 py-1.5' : 'px-4 py-3';

  if (rows.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />;

  return (
    <div>
      <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label={`${caption} (scrollable)`}>
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-muted">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined}
                    className={cx('whitespace-nowrap text-left text-xs font-semibold uppercase tracking-wide text-ink-soft', pad, c.className)}>
                    {c.sortValue ? (
                      <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 rounded hover:text-navy-900">
                        {c.header}
                        {active ? (sort!.dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />) : <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden />}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-white">
            {visible.map((r) => (
              <tr key={rowKey(r)} className="hover:bg-navy-50/40">
                {columns.map((c) => <td key={c.key} className={cx('align-top', pad, c.className)}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border px-4 py-2 text-xs text-ink-soft">
        <span aria-live="polite">Showing {page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} of {sorted.length}</span>
        {pages > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page" className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-navy-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
            <span className="px-2">Page {page + 1} of {pages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Next page" className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-navy-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" aria-hidden /></button>
          </nav>
        )}
      </div>
    </div>
  );
}
