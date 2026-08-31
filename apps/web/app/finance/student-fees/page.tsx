'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { pdf } from '@react-pdf/renderer';
import { api } from '@/lib/api';
import { ReceiptPdfDocument } from '@/lib/receiptPdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DiscountPolicy {
  id: string;
  name: string;
  discountPercent: number;
}

interface StudentFee {
  id: string;
  baseFee: number;
  discountPercent: number;
  discountAmount: number;
  netPayable: number;
  paidAmount: number;
  lateFine: number;
  totalDue: number;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue';
  dueDate: string;
  discountPolicy: { id: string; name: string; discountPercent: number } | null;
  student: {
    id: string;
    name: string;
    email: string;
    studentProfile: { rollNo: string; class: { number: number; section: string } } | null;
  };
  feeStructure: { classNumber: number; monthYear: string; baseFee: number; dueDate: string };
}

interface ReceiptData {
  receiptNumber: string;
  paymentDate: string;
  amount: number;
  monthYear: string;
  student: { name: string; rollNo: string; class: number; section: string };
  studentFee: {
    baseFee: number;
    discountPercent: number;
    discountAmount: number;
    netPayable: number;
    lateFine: number;
    totalDue: number;
    paidAmount: number;
    status: string;
  };
  school: { name: string; address: string | null; phone: string | null; invoiceFooterText: string | null };
  recordedByName: string;
}

const STATUS_VARIANT: Record<StudentFee['status'], 'default' | 'outline' | 'destructive' | 'secondary'> = {
  paid: 'default',
  partial: 'secondary',
  unpaid: 'outline',
  overdue: 'destructive',
};

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

function classLabel(fee: StudentFee): string {
  const p = fee.student.studentProfile;
  return p ? `Class ${p.class.number} - ${p.class.section}` : `Class ${fee.feeStructure.classNumber}`;
}

export default function StudentFeesPage() {
  const [fees, setFees] = useState<StudentFee[]>([]);
  const [policies, setPolicies] = useState<DiscountPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [monthYear, setMonthYear] = useState('');
  const [status, setStatus] = useState('all');
  const [classNumber, setClassNumber] = useState('all');

  const [discountTarget, setDiscountTarget] = useState<StudentFee | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [discountSubmitting, setDiscountSubmitting] = useState(false);

  const [paymentTarget, setPaymentTarget] = useState<StudentFee | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentDate: '', notes: '' });
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  async function handleDownloadReceipt() {
    if (!receipt) return;
    setDownloadingReceipt(true);
    try {
      const blob = await pdf(<ReceiptPdfDocument {...receipt} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Receipt-${receipt.receiptNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingReceipt(false);
    }
  }

  async function loadFees() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (monthYear) params.monthYear = monthYear;
      if (status !== 'all') params.status = status;
      if (classNumber !== 'all') params.classNumber = classNumber;
      const res = await api.get<{ success: boolean; data: { studentFees: StudentFee[] } }>(
        '/api/finance/student-fees',
        { params }
      );
      setFees(res.data.data.studentFees);
    } catch {
      setError('Failed to load student fees.');
    } finally {
      setLoading(false);
    }
  }

  async function loadPolicies() {
    try {
      const res = await api.get<{ success: boolean; data: { policies: DiscountPolicy[] } }>(
        '/api/finance/discount-policies'
      );
      setPolicies(res.data.data.policies.filter((p) => 'discountPercent' in p));
    } catch {
      // Non-fatal — the discount dropdown will just be empty.
    }
  }

  useEffect(() => {
    loadFees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthYear, status, classNumber]);

  useEffect(() => {
    loadPolicies();
  }, []);

  function openDiscountDialog(fee: StudentFee) {
    setDiscountTarget(fee);
    setSelectedPolicyId(fee.discountPolicy?.id ?? '');
    setDiscountError(null);
  }

  async function handleApplyDiscount(e: FormEvent) {
    e.preventDefault();
    if (!discountTarget || !selectedPolicyId) return;
    setDiscountError(null);
    setDiscountSubmitting(true);
    try {
      await api.patch(`/api/finance/student-fees/${discountTarget.id}/discount`, {
        discountPolicyId: selectedPolicyId,
      });
      setDiscountTarget(null);
      await loadFees();
    } catch (err) {
      setDiscountError(getErrorMessage(err, 'Failed to apply discount.'));
    } finally {
      setDiscountSubmitting(false);
    }
  }

  function openPaymentDialog(fee: StudentFee) {
    setPaymentTarget(fee);
    // Only full settlement is accepted — pre-fill the exact balance and the
    // amount field stays read-only (see the dialog below).
    const remaining = fee.totalDue - fee.paidAmount;
    setPaymentForm({ amount: String(remaining), paymentDate: '', notes: '' });
    setPaymentError(null);
  }

  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault();
    if (!paymentTarget) return;
    setPaymentError(null);

    // Mirrors the backend's full-payment-only check for instant feedback —
    // the server still re-validates against the freshest totalDue/paidAmount.
    const remaining = paymentTarget.totalDue - paymentTarget.paidAmount;
    if (Math.abs(Number(paymentForm.amount) - remaining) > 0.01) {
      setPaymentError(`Full payment required. Amount must be exactly PKR ${remaining.toLocaleString()}`);
      return;
    }

    setPaymentSubmitting(true);
    try {
      const paymentRes = await api.post<{ success: boolean; data: { payment: { id: string } } }>(
        `/api/finance/payments/${paymentTarget.id}`,
        {
          amount: Number(paymentForm.amount),
          paymentDate: paymentForm.paymentDate || undefined,
          notes: paymentForm.notes || undefined,
        }
      );
      // The receipt endpoint keys off the FeePayment's own id, not the
      // StudentFee id the payment was recorded against — use the id the
      // POST just returned, not paymentTarget.id.
      const paymentId = paymentRes.data.data.payment.id;
      const res = await api.get<{ success: boolean; data: ReceiptData }>(
        `/api/finance/payments/receipt/${paymentId}`
      );
      setPaymentTarget(null);
      setReceipt(res.data.data);
      await loadFees();
    } catch (err) {
      setPaymentError(getErrorMessage(err, 'Failed to record payment.'));
    } finally {
      setPaymentSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Student Fees</h1>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>Month/Year</Label>
          <Input placeholder="2024-09" value={monthYear} onChange={(e) => setMonthYear(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Class</Label>
          <Select value={classNumber} onValueChange={setClassNumber}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Class {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : fees.length === 0 ? (
        <p className="text-sm text-muted-foreground">No student fees found for these filters.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Month</TableHead>
                <TableHead>Total Due</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fees.map((fee) => (
                <TableRow key={fee.id}>
                  <TableCell>
                    <div className="font-medium">{fee.student.name}</div>
                    <div className="text-xs text-muted-foreground">{fee.student.studentProfile?.rollNo}</div>
                  </TableCell>
                  <TableCell>{classLabel(fee)}</TableCell>
                  <TableCell>{fee.feeStructure.monthYear}</TableCell>
                  <TableCell>PKR {fee.totalDue.toLocaleString()}</TableCell>
                  <TableCell>PKR {fee.paidAmount.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[fee.status]}>{fee.status}</Badge>
                  </TableCell>
                  <TableCell>{fee.discountPolicy ? `${fee.discountPolicy.discountPercent}%` : '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openDiscountDialog(fee)}>
                        Discount
                      </Button>
                      {fee.status === 'paid' ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Fully Paid</Badge>
                      ) : (
                        <Button size="sm" onClick={() => openPaymentDialog(fee)}>
                          Pay
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Apply discount dialog */}
      <Dialog open={Boolean(discountTarget)} onOpenChange={(open) => !open && setDiscountTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Discount — {discountTarget?.student.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleApplyDiscount} className="space-y-4">
            <div className="space-y-2">
              <Label>Discount Policy</Label>
              <Select value={selectedPolicyId} onValueChange={setSelectedPolicyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a policy" />
                </SelectTrigger>
                <SelectContent>
                  {policies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.discountPercent}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {policies.length === 0 && (
                <p className="text-xs text-muted-foreground">No discount policies configured yet.</p>
              )}
            </div>
            {discountError && (
              <p className="text-sm text-destructive" role="alert">
                {discountError}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={discountSubmitting || !selectedPolicyId}>
                {discountSubmitting ? 'Applying...' : 'Apply Discount'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record payment dialog */}
      <Dialog open={Boolean(paymentTarget)} onOpenChange={(open) => !open && setPaymentTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment — {paymentTarget?.student.name}</DialogTitle>
          </DialogHeader>
          {paymentTarget && (
            <p className="text-sm text-muted-foreground">
              Balance remaining: PKR {(paymentTarget.totalDue - paymentTarget.paidAmount).toLocaleString()}
            </p>
          )}
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="space-y-2">
              <Label>
                Full payment required — PKR {Number(paymentForm.amount || 0).toLocaleString()}
              </Label>
              <Input
                type="number"
                required
                readOnly
                value={paymentForm.amount}
                className="bg-gray-50 cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={paymentForm.paymentDate}
                onChange={(e) => setPaymentForm((f) => ({ ...f, paymentDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {paymentError && (
              <p className="text-sm text-destructive" role="alert">
                {paymentError}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={paymentSubmitting}>
                {paymentSubmitting ? 'Recording...' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Dialog open={Boolean(receipt)} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
          </DialogHeader>
          {receipt && (
            <div className="space-y-3 text-sm">
              <div className="text-center">
                <div className="font-semibold">{receipt.school.name}</div>
                <div className="text-xs text-muted-foreground">Receipt #{receipt.receiptNumber}</div>
              </div>
              <div className="space-y-1 rounded-md border p-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Student</span>
                  <span className="font-medium">{receipt.student.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Class</span>
                  <span>
                    {receipt.student.class} - {receipt.student.section} (Roll No: {receipt.student.rollNo})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Month</span>
                  <span>{receipt.monthYear}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="font-medium">PKR {receipt.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Date</span>
                  <span>{new Date(receipt.paymentDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={STATUS_VARIANT[receipt.studentFee.status as StudentFee['status']]}>
                    {receipt.studentFee.status}
                  </Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!receipt || downloadingReceipt}
              onClick={handleDownloadReceipt}
            >
              {downloadingReceipt ? 'Preparing...' : 'Download Receipt PDF'}
            </Button>
            <Button variant="outline" onClick={() => setReceipt(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
