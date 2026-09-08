'use client';

import { useEffect, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { api } from '@/lib/api';
import { ChallanPdfDocument } from '@/lib/challanPdf';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
