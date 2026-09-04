"use client";

import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchPatientsForBookingAction } from "./search-actions";

type PatientMatch = { id: string; name: string; phone: string | null };

/**
 * A minimal search-as-you-type picker, not a full combobox -- there's no
 * cmdk/Popover dependency in this project yet, and adding one for a single
 * field isn't worth the new dependency surface at MVP scale (patients/
 * queries.ts's trigram search already makes this fast regardless of list
 * size, which is the part that actually matters).
 */
export function PatientPicker({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (patient: { id: string; name: string } | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleQueryChange(next: string) {
    setQuery(next);
    if (!next.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const matches = await searchPatientsForBookingAction(next);
      setResults(matches);
      setOpen(true);
    });
  }

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
        <span className="font-medium">{value.name}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onChange(null)}
          aria-label="Change patient"
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search patients by name or phone…"
          className="pl-8"
        />
      </div>
      {open && (
        <div className="bg-popover absolute z-10 mt-1 w-full rounded-lg border shadow-md">
          {pending ? (
            <p className="text-muted-foreground p-3 text-sm">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">No patients found.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto p-1">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="hover:bg-muted flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange({ id: p.id, name: p.name });
                      setQuery("");
                      setResults([]);
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{p.name}</span>
                    {p.phone && <span className="text-muted-foreground text-xs">{p.phone}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
