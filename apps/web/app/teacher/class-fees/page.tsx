'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { pdf } from '@react-pdf/renderer';
import { api } from '@/lib/api';
import { ChallanPdfDocument } from '@/lib/challanPdf';
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

interface FeeRow {
  id: string;
  studentProfileId: string | null;
  studentName: string;
  rollNo: string;
  classNumber: number | null;
  section: string | null;
  dueDate: string;
  baseFee: number;
  discountAmount: number;
  netPayable: number;
  lateFine: number;
  totalDue: number;
  paidAmount: number;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue';
}

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-green-100 text-green-800 hover:bg-green-100',
  partial: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  overdue: 'bg-red-100 text-red-800 hover:bg-red-100',
  unpaid: 'bg-gray-100 text-gray-700 hover:bg-gray-100',
};

function money(n: number): string {
  return `PKR ${n.toLocaleString()}`;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

function defaultMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function TeacherClassFeesPage() {
  const [monthYear, setMonthYear] = useState(defaultMonthYear());
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [messageTarget, setMessageTarget] = useState<FeeRow | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageSending, setMessageSending] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  useEffect(() => {
    if (!monthYear) return;
    setLoading(true);
    setError(null);
    api
      .get<{ success: boolean; data: { fees: FeeRow[] } }>('/api/teacher/class-fees', {
        params: { monthYear },
      })
      .then((res) => setFees(res.data.data.fees))
      .catch(() => setError('Failed to load class fees.'))
      .finally(() => setLoading(false));
  }, [monthYear]);

  async function handleDownloadChallan(fee: FeeRow) {
    setDownloadingId(fee.id);
    try {
      const blob = await pdf(
        <ChallanPdfDocument
          schoolName="EduPortal School"
          student={{
            name: fee.studentName,
            rollNo: fee.rollNo,
            classNumber: fee.classNumber ?? 0,
            section: fee.section ?? '',
          }}
          monthYear={monthYear}
          dueDate={fee.dueDate}
          baseFee={fee.baseFee}
          discountAmount={fee.discountAmount}
          netPayable={fee.netPayable}
          lateFine={fee.lateFine}
          totalDue={fee.totalDue}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Challan-${fee.studentName}-${monthYear}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  }

  function openMessageDialog(fee: FeeRow) {
    setMessageTarget(fee);
    setMessageText('');
    setMessageError(null);
    setMessageSent(false);
  }

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault();
    if (!messageTarget?.studentProfileId) return;
    setMessageError(null);
    setMessageSending(true);
    try {
      await api.post(`/api/teacher/students/${messageTarget.studentProfileId}/message-parent`, {
        message: messageText,
      });
      setMessageSent(true);
    } catch (err) {
      setMessageError(getErrorMessage(err, 'Failed to send message.'));
    } finally {
      setMessageSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-xl font-semibold">Class Fees</h1>
        <div className="space-y-2">
          <Label>Month/Year</Label>
          <Input value={monthYear} onChange={(e) => setMonthYear(e.target.value)} placeholder="2026-09" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : fees.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No fee records for this month.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Total Due</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fees.map((fee) => (
                <TableRow key={fee.id}>
                  <TableCell>
                    <div className="font-medium">{fee.studentName}</div>
                    <div className="text-xs text-muted-foreground">{fee.rollNo}</div>
                  </TableCell>
                  <TableCell>
                    {fee.classNumber != null ? `${fee.classNumber}-${fee.section}` : '—'}
                  </TableCell>
                  <TableCell>{money(fee.totalDue)}</TableCell>
                  <TableCell>{money(fee.paidAmount)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLE[fee.status]}>
                      {fee.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={downloadingId === fee.id}
                        onClick={() => handleDownloadChallan(fee)}
                      >
                        {downloadingId === fee.id ? 'Preparing...' : 'Download Challan'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!fee.studentProfileId}
                        onClick={() => openMessageDialog(fee)}
                      >
                        Message Parent
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(messageTarget)} onOpenChange={(open) => !open && setMessageTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message {messageTarget?.studentName}&apos;s Parent</DialogTitle>
          </DialogHeader>
          {messageSent ? (
            <p className="text-sm text-green-700">Message sent to the parent.</p>
          ) : (
            <form onSubmit={handleSendMessage} className="space-y-4">
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  required
                  rows={4}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="e.g. Please ensure fee is cleared by the due date..."
                />
              </div>
              {messageError && (
                <p className="text-sm text-destructive" role="alert">
                  {messageError}
                </p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={messageSending}>
                  {messageSending ? 'Sending...' : 'Send Message'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
