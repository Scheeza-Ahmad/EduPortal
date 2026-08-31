import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

export interface ReportStudentRow {
  name: string;
  rollNo: string;
  baseFee: number;
  discount: number;
  netPayable: number;
  lateFine: number;
  totalDue: number;
  paidAmount: number;
  status: string;
  lastPaymentDate: string | null;
  receiptNumber: string | null;
}

export interface ReportClassGroup {
  classNumber: number;
  section: string;
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  studentCount: number;
  students: ReportStudentRow[];
}

export interface FinanceReportPdfProps {
  schoolName: string;
  monthYear: string;
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  totalLateFine: number;
  byClass: ReportClassGroup[];
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 11, color: '#52514e', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', marginBottom: 20, gap: 12 },
  summaryBox: {
    flex: 1,
    border: '1pt solid #ddd',
    borderRadius: 4,
    padding: 8,
  },
  summaryLabel: { fontSize: 8, color: '#7a7a7a' },
  summaryValue: { fontSize: 12, fontWeight: 700, marginTop: 2 },
  classHeader: { fontSize: 11, fontWeight: 700, marginTop: 16, marginBottom: 6 },
  table: { display: 'flex', width: '100%', borderTop: '1pt solid #ddd', borderLeft: '1pt solid #ddd' },
  tableRow: { flexDirection: 'row' },
  tableHeaderCell: {
    flex: 1,
    padding: 4,
    backgroundColor: '#f3f3f1',
    borderRight: '1pt solid #ddd',
    borderBottom: '1pt solid #ddd',
    fontWeight: 700,
    fontSize: 8,
  },
  tableCell: {
    flex: 1,
    padding: 4,
    borderRight: '1pt solid #ddd',
    borderBottom: '1pt solid #ddd',
    fontSize: 8,
  },
});

function money(n: number): string {
  return `PKR ${n.toLocaleString()}`;
}

export function FinanceReportPdfDocument({
  schoolName,
  monthYear,
  totalDue,
  totalPaid,
  totalPending,
  totalLateFine,
  byClass,
}: FinanceReportPdfProps) {
  const collectionRate = totalDue > 0 ? ((totalPaid / totalDue) * 100).toFixed(1) : '0.0';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{schoolName}</Text>
        <Text style={styles.subtitle}>Finance Report — {monthYear}</Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Due</Text>
            <Text style={styles.summaryValue}>{money(totalDue)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total Paid</Text>
            <Text style={styles.summaryValue}>{money(totalPaid)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Pending</Text>
            <Text style={styles.summaryValue}>{money(totalPending)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Collection Rate</Text>
            <Text style={styles.summaryValue}>{collectionRate}%</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Late Fines</Text>
            <Text style={styles.summaryValue}>{money(totalLateFine)}</Text>
          </View>
        </View>

        {byClass.map((group) => (
          <View key={`${group.classNumber}-${group.section}`} wrap={false}>
            <Text style={styles.classHeader}>
              Class {group.classNumber} - Section {group.section} ({group.studentCount} students)
            </Text>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <Text style={styles.tableHeaderCell}>Student</Text>
                <Text style={styles.tableHeaderCell}>Due</Text>
                <Text style={styles.tableHeaderCell}>Discount</Text>
                <Text style={styles.tableHeaderCell}>Payable</Text>
                <Text style={styles.tableHeaderCell}>Paid</Text>
                <Text style={styles.tableHeaderCell}>Status</Text>
              </View>
              {group.students.map((s) => (
                <View key={s.rollNo + s.name} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{s.name}</Text>
                  <Text style={styles.tableCell}>{s.baseFee.toLocaleString()}</Text>
                  <Text style={styles.tableCell}>{s.discount.toLocaleString()}</Text>
                  <Text style={styles.tableCell}>{s.netPayable.toLocaleString()}</Text>
                  <Text style={styles.tableCell}>{s.paidAmount.toLocaleString()}</Text>
                  <Text style={styles.tableCell}>{s.status.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}
