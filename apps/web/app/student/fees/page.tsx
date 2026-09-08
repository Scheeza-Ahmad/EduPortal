'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  monthYear: string;
  dueDate: string;
  baseFee: number;
  discountAmount: number;
  netPayable: number;
  lateFine: number;
  totalDue: number;
  paidAmount: number;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue';
}

interface StudentInfo {
  name: string;
  rollNo: string;
  classNumber: number;
  section: string;
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

export default function StudentFeesPage() {
  const [schoolName, setSchoolName] = useState('EduPortal School');
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ success: boolean; data: { schoolName: string; student: StudentInfo; fees: FeeRow[] } }>(
        '/api/student/fees'
      )
      .then((res) => {
        setSchoolName(res.data.data.schoolName || 'EduPortal School');
        setStudent(res.data.data.student);
        setFees(res.data.data.fees);
      })
      .catch(() => setError('Failed to load fee records.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleDownloadChallan(fee: FeeRow) {
    if (!student) return;
    setDownloadingId(fee.id);
    try {
      // Loaded on demand — @react-pdf/renderer is a heavy PDF-layout engine
      // that has no reason to be in this page's initial bundle.
      const [{ pdf }, { ChallanPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/challanPdf'),
      ]);
      const blob = await pdf(
        <ChallanPdfDocument
          schoolName={schoolName}
          student={{
            name: student.name,
            rollNo: student.rollNo,
            classNumber: student.classNumber,
            section: student.section,
          }}
          monthYear={fee.monthYear}
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
      a.download = `Challan-${fee.monthYear}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading fees...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">My Fees</h1>

      {fees.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No fee records yet.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Base Fee</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Net Payable</TableHead>
                <TableHead>Late Fine</TableHead>
                <TableHead>Total Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fees.map((fee) => (
                <TableRow key={fee.id}>
                  <TableCell className="font-medium">{fee.monthYear}</TableCell>
                  <TableCell>{money(fee.baseFee)}</TableCell>
                  <TableCell>{money(fee.discountAmount)}</TableCell>
                  <TableCell>{money(fee.netPayable)}</TableCell>
                  <TableCell>{money(fee.lateFine)}</TableCell>
                  <TableCell>{money(fee.totalDue)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLE[fee.status]}>
                      {fee.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {fee.status !== 'paid' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={downloadingId === fee.id}
                        onClick={() => handleDownloadChallan(fee)}
                      >
                        {downloadingId === fee.id ? 'Preparing...' : 'Download Challan'}
                      </Button>
                    )}
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
