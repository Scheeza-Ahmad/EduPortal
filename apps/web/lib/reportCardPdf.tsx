import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

export interface ReportCardActivity {
  title: string;
  type: string;
  marks: number;
  totalMarks: number;
}

export interface ReportCardSubject {
  subjectName: string;
  teacherName: string;
  activities: ReportCardActivity[];
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade: string;
}

export interface ReportCardData {
  student: { name: string; rollNo: string; class: number; section: string; photoUrl: string | null };
  school: { name: string; address: string | null; principalName: string | null };
  subjects: ReportCardSubject[];
  attendance: { totalDays: number; presentDays: number; percentage: number };
  overallPercentage: number;
  overallGrade: string;
  generatedAt: string;
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica' },
  center: { textAlign: 'center' },
  schoolName: { fontSize: 16, fontWeight: 700 },
  schoolLine: { fontSize: 9, color: '#52514e', marginTop: 2 },
  title: { fontSize: 13, fontWeight: 700, marginTop: 8 },
  subtitle: { fontSize: 9, color: '#52514e', marginTop: 2 },
  divider: { borderBottom: '1pt solid #ddd', marginVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { color: '#52514e' },
  value: { fontWeight: 700 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 8 },
  table: { display: 'flex', width: '100%', borderTop: '1pt solid #ddd', borderLeft: '1pt solid #ddd' },
  tableRow: { flexDirection: 'row' },
  th: {
    flex: 1,
    padding: 4,
    backgroundColor: '#f3f3f1',
    borderRight: '1pt solid #ddd',
    borderBottom: '1pt solid #ddd',
    fontWeight: 700,
    fontSize: 8,
  },
  td: { flex: 1, padding: 4, borderRight: '1pt solid #ddd', borderBottom: '1pt solid #ddd', fontSize: 8 },
  totalRow: { backgroundColor: '#f9f9f7' },
  footer: { marginTop: 24, fontSize: 9 },
  signatureLine: { marginTop: 28, borderTop: '1pt solid #333', width: 180, paddingTop: 4 },
});

export function ReportCardPdfDocument({ student, school, subjects, attendance, overallPercentage, overallGrade, generatedAt }: ReportCardData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.center}>
          <Text style={styles.schoolName}>{school.name}</Text>
          {school.address && <Text style={styles.schoolLine}>{school.address}</Text>}
          <Text style={styles.title}>REPORT CARD</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.label}>Student:</Text>
          <Text style={styles.value}>{student.name}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Roll No:</Text>
          <Text style={styles.value}>{student.rollNo}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Class:</Text>
          <Text style={styles.value}>
            {student.class}-{student.section}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Generated:</Text>
          <Text style={styles.value}>
            {new Date(generatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>ACADEMIC PERFORMANCE</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.th}>Subject</Text>
            <Text style={styles.th}>Total</Text>
            <Text style={styles.th}>Obtained</Text>
            <Text style={styles.th}>%</Text>
            <Text style={styles.th}>Grade</Text>
          </View>
          {subjects.map((s) => (
            <View key={s.subjectName} style={styles.tableRow}>
              <Text style={styles.td}>{s.subjectName}</Text>
              <Text style={styles.td}>{s.totalMarks}</Text>
              <Text style={styles.td}>{s.obtainedMarks}</Text>
              <Text style={styles.td}>{s.percentage}%</Text>
              <Text style={styles.td}>{s.grade}</Text>
            </View>
          ))}
          <View style={[styles.tableRow, styles.totalRow]}>
            <Text style={[styles.td, { fontWeight: 700 }]}>OVERALL</Text>
            <Text style={[styles.td, { fontWeight: 700 }]}>
              {subjects.reduce((sum, s) => sum + s.totalMarks, 0)}
            </Text>
            <Text style={[styles.td, { fontWeight: 700 }]}>
              {subjects.reduce((sum, s) => sum + s.obtainedMarks, 0)}
            </Text>
            <Text style={[styles.td, { fontWeight: 700 }]}>{overallPercentage}%</Text>
            <Text style={[styles.td, { fontWeight: 700 }]}>{overallGrade}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>ATTENDANCE</Text>
        <View style={styles.row}>
          <Text>
            Total Days: {attendance.totalDays}  Present: {attendance.presentDays}  Rate:{' '}
            {attendance.percentage}%
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.footer}>
          <Text>Class Teacher Remarks: ________________________________</Text>
          <View style={styles.signatureLine}>
            <Text style={{ fontSize: 8, color: '#52514e' }}>
              Principal Signature{school.principalName ? ` — ${school.principalName}` : ''}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
