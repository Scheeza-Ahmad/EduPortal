'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface ConsentForm {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  isActive: boolean;
  responseCount: number;
}

interface ResponseRow {
  parentName: string;
  studentName: string;
  response: 'approved' | 'rejected' | 'pending';
  notes: string | null;
  respondedAt: string | null;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

const RESPONSE_ICON: Record<string, string> = { approved: '✅', rejected: '❌', pending: '⏳' };
const RESPONSE_STYLE: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  pending: 'bg-gray-100 text-gray-700',
};

export default function AdminConsentFormsPage() {
  const [forms, setForms] = useState<ConsentForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', dueDate: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [responsesTarget, setResponsesTarget] = useState<ConsentForm | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);

  async function loadForms() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { forms: ConsentForm[] } }>('/api/admin/consent-forms');
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

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post('/api/admin/consent-forms', form);
      setDialogOpen(false);
      setForm({ title: '', description: '', dueDate: '' });
      await loadForms();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to create consent form.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(formToDelete: ConsentForm) {
    try {
      await api.delete(`/api/admin/consent-forms/${formToDelete.id}`);
      await loadForms();
    } catch {
      setError('Failed to delete consent form.');
    }
  }

  async function openResponses(formToView: ConsentForm) {
    setResponsesTarget(formToView);
    setLoadingResponses(true);
    try {
      const res = await api.get<{ success: boolean; data: { responses: ResponseRow[] } }>(
        `/api/admin/consent-forms/${formToView.id}/responses`
      );
      setResponses(res.data.data.responses);
    } catch {
      setResponses([]);
    } finally {
      setLoadingResponses(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Consent Forms</h1>
        <Button
          onClick={() => {
            setForm({ title: '', description: '', dueDate: '' });
            setFormError(null);
            setDialogOpen(true);
          }}
        >
          + New Form
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : forms.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No consent forms yet.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Responses</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((f) => (
                <TableRow key={f.id} className="cursor-pointer" onClick={() => openResponses(f)}>
                  <TableCell className="font-medium">{f.title}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-muted-foreground">{f.description}</TableCell>
                  <TableCell>{new Date(f.dueDate).toLocaleDateString()}</TableCell>
                  <TableCell>{f.responseCount}</TableCell>
                  <TableCell className="text-right">
                    {f.isActive && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(f);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Consent Form</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                required
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                required
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(responsesTarget)} onOpenChange={(open) => !open && setResponsesTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Responses — {responsesTarget?.title}</DialogTitle>
          </DialogHeader>
          {loadingResponses ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : responses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No parents to respond yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parent</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {responses.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.parentName}</TableCell>
                    <TableCell>{r.studentName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={RESPONSE_STYLE[r.response]}>
                        {RESPONSE_ICON[r.response]} {r.response}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.respondedAt ? new Date(r.respondedAt).toLocaleDateString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
