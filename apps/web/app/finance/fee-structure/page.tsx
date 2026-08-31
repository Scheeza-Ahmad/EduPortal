'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FeeStructure {
  id: string;
  classNumber: number;
  monthYear: string;
  baseFee: number;
  dueDate: string;
  createdAt: string;
}

interface ClassGroup {
  classNumber: number;
  structures: FeeStructure[];
}

const CLASS_NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1);

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function FeeStructurePage() {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ classNumber: '1', monthYear: '', baseFee: '', dueDate: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadStructures() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { byClass: ClassGroup[] } }>(
        '/api/finance/fee-structure'
      );
      setGroups(res.data.data.byClass);
    } catch {
      setError('Failed to load fee structures.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStructures();
  }, []);

  function openAddDialog() {
    setForm({ classNumber: '1', monthYear: '', baseFee: '', dueDate: '' });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ success: boolean; data: { studentFeesGenerated: number } }>(
        '/api/finance/fee-structure',
        {
          classNumber: Number(form.classNumber),
          monthYear: form.monthYear,
          baseFee: Number(form.baseFee),
          dueDate: form.dueDate,
        }
      );
      setDialogOpen(false);
      setSuccessMsg(
        `Fee structure created — ${res.data.data.studentFeesGenerated} student fee record(s) generated.`
      );
      await loadStructures();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to create fee structure.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Fee Structure</h1>
        <Button onClick={openAddDialog}>+ New Fee Structure</Button>
      </div>

      {successMsg && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
          {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fee structures set up yet.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.classNumber}>
              <CardHeader>
                <CardTitle className="text-base">Class {group.classNumber}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {group.structures.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
                    >
                      <span className="font-medium">{s.monthYear}</span>
                      <span className="text-muted-foreground">Base Fee: PKR {s.baseFee.toLocaleString()}</span>
                      <span className="text-muted-foreground">Due: {fmtDate(s.dueDate)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Fee Structure</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select
                  value={form.classNumber}
                  onValueChange={(v) => setForm((f) => ({ ...f, classNumber: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASS_NUMBERS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Class {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Month/Year</Label>
                <Input
                  required
                  placeholder="2024-09"
                  value={form.monthYear}
                  onChange={(e) => setForm((f) => ({ ...f, monthYear: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Base Fee (PKR)</Label>
              <Input
                type="number"
                min={0}
                required
                value={form.baseFee}
                onChange={(e) => setForm((f) => ({ ...f, baseFee: e.target.value }))}
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
            <p className="text-xs text-muted-foreground">
              A fee record will be generated automatically for every student currently in this class.
            </p>
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Fee Structure'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
