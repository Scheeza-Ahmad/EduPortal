'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ConsentFormRow {
  formId: string;
  title: string;
  description: string;
  dueDate: string;
  isExpired: boolean;
  studentId: string;
  studentName: string;
  status: 'approved' | 'rejected' | 'pending';
  notes: string | null;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

const STATUS_STYLE: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  pending: 'bg-gray-100 text-gray-700',
};

export default function ParentConsentFormsPage() {
  const [forms, setForms] = useState<ConsentFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [notesByKey, setNotesByKey] = useState<Record<string, string>>({});

  async function loadForms() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { forms: ConsentFormRow[] } }>(
        '/api/parent/consent-forms'
      );
      setForms(res.data.data.forms);
    } catch {
      setError('Failed to load consent forms.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadForms();
  }, []);

  async function handleRespond(row: ConsentFormRow, approved: boolean) {
    const key = `${row.formId}:${row.studentId}`;
    setSubmittingKey(key);
    setError(null);
    try {
      await api.post(`/api/parent/consent-forms/${row.formId}/respond`, {
        studentId: row.studentId,
        approved,
        notes: notesByKey[key] || undefined,
      });
      await loadForms();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to submit response.'));
    } finally {
      setSubmittingKey(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading consent forms...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Consent Forms</h1>

      {forms.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No consent forms right now.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((row) => {
            const key = `${row.formId}:${row.studentId}`;
            return (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">📋 {row.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{row.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Due: {new Date(row.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                  <div className="text-sm">
                    For: <span className="font-medium">{row.studentName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    {row.isExpired && row.status === 'pending' ? (
                      <Badge variant="outline" className="bg-gray-200 text-gray-700">
                        Expired
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={STATUS_STYLE[row.status]}>
                        {row.status}
                      </Badge>
                    )}
                  </div>

                  {!row.isExpired && (
                    <>
                      <Textarea
                        placeholder="Notes (optional)"
                        value={notesByKey[key] ?? row.notes ?? ''}
                        onChange={(e) => setNotesByKey((n) => ({ ...n, [key]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={submittingKey === key}
                          onClick={() => handleRespond(row, true)}
                        >
                          ✅ Approve
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={submittingKey === key}
                          onClick={() => handleRespond(row, false)}
                        >
                          ❌ Decline
                        </Button>
                      </div>
                      {row.status !== 'pending' && (
                        <p className="text-xs text-muted-foreground">
                          You already responded — submitting again will change your response.
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
