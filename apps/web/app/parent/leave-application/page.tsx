'use client';

import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { useParentStore } from '@/lib/parentStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type LeaveType = 'leave' | 'half_day';

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function ParentLeaveApplicationPage() {
  const children = useParentStore((s) => s.children);
  const selectedChildId = useParentStore((s) => s.selectedChildId);

  const [studentId, setStudentId] = useState(selectedChildId ?? '');
  const [type, setType] = useState<LeaveType>('leave');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!studentId) {
      setError('Select a child.');
      return;
    }
    if (type === 'leave' && !toDate) {
      setError('Select an end date for the leave.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/parent/leave-application', {
        studentId,
        type,
        fromDate,
        toDate: type === 'half_day' ? undefined : toDate,
        reason,
      });
      setSuccess('Application submitted — the class teacher will review it shortly.');
      setFromDate('');
      setToDate('');
      setReason('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to submit application.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-semibold">Leave / Half-Day Application</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Application</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {children.length > 1 && (
              <div className="space-y-2">
                <Label>Child</Label>
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a child" />
                  </SelectTrigger>
                  <SelectContent>
                    {children.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} (Class {c.class.number}
                        {c.class.section})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leave">Leave (full day)</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === 'half_day' ? (
              <div className="space-y-2">
                <Label htmlFor="leave-date">Date</Label>
                <Input
                  id="leave-date"
                  type="date"
                  required
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="from-date">From Date</Label>
                  <Input
                    id="from-date"
                    type="date"
                    required
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="to-date">To Date</Label>
                  <Input
                    id="to-date"
                    type="date"
                    required
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Application'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
