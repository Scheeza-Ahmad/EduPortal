'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';

interface SearchResults {
  students: { id: string; name: string; rollNo: string | null; classLabel: string | null }[];
  teachers: { id: string; name: string; subjects: string[] }[];
  classes: { id: string; label: string; studentCount: number; classTeacherName: string | null }[];
  subjects: { id: string; name: string; classLabel: string; teacherName: string }[];
}

const EMPTY: SearchResults = { students: [], teachers: [], classes: [], subjects: [] };

export function AdminSearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      api
        .get<{ success: boolean; data: SearchResults }>('/api/admin/search', { params: { q: query, type: 'all' } })
        .then((res) => {
          setResults(res.data.data);
          setOpen(true);
        })
        .catch(() => setResults(EMPTY))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const hasResults =
    results.students.length > 0 ||
    results.teachers.length > 0 ||
    results.classes.length > 0 ||
    results.subjects.length > 0;

  function goTo(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search students, teachers, classes..."
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-96 w-full overflow-y-auto rounded-md border bg-popover p-2 shadow-md">
          {!hasResults && !loading ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No results found.</p>
          ) : (
            <>
              {results.students.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Students</div>
                  {results.students.map((s) => (
                    <button
                      key={s.id}
                      className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => goTo('/admin/students-classes')}
                    >
                      {s.name}
                      <span className="text-muted-foreground">
                        {s.classLabel ? ` — Class ${s.classLabel}` : ''}
                        {s.rollNo ? ` (Roll ${s.rollNo})` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {results.teachers.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Teachers</div>
                  {results.teachers.map((t) => (
                    <button
                      key={t.id}
                      className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => goTo('/admin/teachers')}
                    >
                      {t.name}
                      {t.subjects.length > 0 && (
                        <span className="text-muted-foreground"> — {t.subjects.join(', ')}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {results.classes.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Classes</div>
                  {results.classes.map((c) => (
                    <button
                      key={c.id}
                      className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => goTo('/admin/students-classes')}
                    >
                      {c.label}
                      <span className="text-muted-foreground"> — {c.studentCount} students</span>
                    </button>
                  ))}
                </div>
              )}
              {results.subjects.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Subjects</div>
                  {results.subjects.map((sub) => (
                    <button
                      key={sub.id}
                      className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => goTo('/admin/subjects')}
                    >
                      {sub.name}
                      <span className="text-muted-foreground">
                        {' '}
                        — Class {sub.classLabel} ({sub.teacherName})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
