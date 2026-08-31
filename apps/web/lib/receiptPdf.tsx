import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

export interface ReceiptPdfProps {
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
  school: {
    name: string;
    address: string | null;
    phone: string | null;
    invoiceFooterText: string | null;
  };
  recordedByName: string;
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11, fontFamily: 'Helvetica' },
  center: { textAlign: 'center' },
  schoolName: { fontSize: 16, fontWeight: 700 },
  schoolLine: { fontSize: 9, color: '#52514e', marginTop: 2 },
  divider: { borderBottom: '1pt solid #ddd', marginVertical: 12 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 6, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { color: '#52514e' },
  value: { fontWeight: 700 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  totalLabel: { fontSize: 13, fontWeight: 700 },
  totalValue: { fontSize: 13, fontWeight: 700 },
  footer: { marginTop: 20, textAlign: 'center', fontSize: 9, color: '#52514e' },
});

function money(n: number): string {
  return `PKR ${n.toLocaleString()}`;
}

export function ReceiptPdfDocument({
  receiptNumber,
  paymentDate,
  amount,
  monthYear,
  student,
  studentFee,
  school,
  recordedByName,
}: ReceiptPdfProps) {
  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.center}>
          <Text style={styles.schoolName}>{school.name}</Text>
          {school.address && <Text style={styles.schoolLine}>{school.address}</Text>}
          {school.phone && <Text style={styles.schoolLine}>{school.phone}</Text>}
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>PAYMENT RECEIPT</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Receipt No:</Text>
          <Text style={styles.value}>{receiptNumber}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date:</Text>
          <Text style={styles.value}>
            {new Date(paymentDate).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.label}>Student:</Text>
          <Text style={styles.value}>{student.name}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Class:</Text>
          <Text style={styles.value}>
            {student.class} - {student.section} &nbsp;&nbsp; Roll No: {student.rollNo}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Month:</Text>
          <Text style={styles.value}>{monthYear}</Text>
        </View>

        <View style={styles.divider} />

        <Text style={{ fontWeight: 700, marginBottom: 6 }}>Fee Details:</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Base Fee:</Text>
          <Text>{money(studentFee.baseFee)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Discount ({studentFee.discountPercent}%):</Text>
          <Text>{money(studentFee.discountAmount)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Net Payable:</Text>
          <Text>{money(studentFee.netPayable)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Late Fine:</Text>
          <Text>{money(studentFee.lateFine)}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL PAID:</Text>
          <Text style={styles.totalValue}>{money(amount)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Status:</Text>
          <Text style={styles.value}>
            {studentFee.status === 'paid' ? '✅ PAID' : studentFee.status.toUpperCase()}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.footer}>
          <Text>Recorded by: {recordedByName}</Text>
          <Text style={{ marginTop: 4 }}>Thank you for your payment.</Text>
          {school.phone && <Text style={{ marginTop: 2 }}>Contact: {school.phone}</Text>}
        </View>
      </Page>
    </Document>
  );
}
