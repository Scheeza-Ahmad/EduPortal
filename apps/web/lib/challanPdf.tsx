import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

export interface ChallanPdfProps {
  schoolName: string;
  student: { name: string; rollNo: string; classNumber: number; section: string };
  monthYear: string;
  dueDate: string;
  baseFee: number;
  discountAmount: number;
  netPayable: number;
  lateFine: number;
  totalDue: number;
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11, fontFamily: 'Helvetica' },
  center: { textAlign: 'center' },
  schoolName: { fontSize: 16, fontWeight: 700 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginTop: 4, textAlign: 'center' },
  divider: { borderBottom: '1pt solid #ddd', marginVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { color: '#52514e' },
  value: { fontWeight: 700 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  totalLabel: { fontSize: 13, fontWeight: 700 },
  totalValue: { fontSize: 13, fontWeight: 700, color: '#b91c1c' },
  footer: { marginTop: 20, textAlign: 'center', fontSize: 9, color: '#52514e' },
});

function money(n: number): string {
  return `PKR ${n.toLocaleString()}`;
}

export function ChallanPdfDocument({
  schoolName,
  student,
  monthYear,
  dueDate,
  baseFee,
  discountAmount,
  netPayable,
  lateFine,
  totalDue,
}: ChallanPdfProps) {
  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.center}>
          <Text style={styles.schoolName}>{schoolName}</Text>
          <Text style={styles.sectionTitle}>FEE CHALLAN</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.label}>Student:</Text>
          <Text style={styles.value}>{student.name}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Class:</Text>
          <Text style={styles.value}>
            {student.classNumber}-{student.section} &nbsp;&nbsp; Roll No: {student.rollNo}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Month:</Text>
          <Text style={styles.value}>{monthYear}</Text>
        </View>

        <View style={styles.divider} />

        <Text style={{ fontWeight: 700, marginBottom: 6 }}>Fee Breakdown:</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Base Fee:</Text>
          <Text>{money(baseFee)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Discount:</Text>
          <Text>{money(discountAmount)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Net Payable:</Text>
          <Text>{money(netPayable)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Late Fine:</Text>
          <Text>{money(lateFine)}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL DUE:</Text>
          <Text style={styles.totalValue}>{money(totalDue)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Due Date:</Text>
          <Text style={styles.value}>
            {new Date(dueDate).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.footer}>
          <Text>Please pay at school finance office.</Text>
          <Text style={{ marginTop: 4 }}>Thank you.</Text>
        </View>
      </Page>
    </Document>
  );
}
