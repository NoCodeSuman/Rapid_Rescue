import { Search, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button } from '../ui/Button';

export function FilterBar({ search, onSearch, placeholder = 'Search…', children, onClear, active }: {
  search: string; onSearch: (v: string) => void; placeholder?: string; children?: ReactNode; onClear: () => void; active: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-surface-border p-4" role="search">
      <div className="min-w-[200px] flex-1">
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-soft">Search</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input id={id} value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} className="block min-h-[40px] w-full rounded-md border border-surface-border bg-white py-2 pl-9 pr-3 text-sm" />
        </div>
      </div>
      {children}
      {active && <Button variant="ghost" size="sm" onClick={onClear}><X className="h-4 w-4" aria-hidden />Clear filters</Button>}
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-soft">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="block min-h-[40px] rounded-md border border-surface-border bg-white px-3 py-2 text-sm">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
