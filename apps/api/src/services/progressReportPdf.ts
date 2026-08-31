import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11, fontFamily: 'Helvetica' },
  title: { fontSize: 18, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 11, color: '#555555', marginBottom: 16 },
  sectionTitle: { fontSize: 13, marginTop: 16, marginBottom: 6, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eeeeee', paddingVertical: 4 },
  cell: { flex: 1 },
  statRow: { flexDirection: 'row', marginBottom: 4 },
  statLabel: { width: 160, color: '#555555' },
});

export interface ProgressReportData {
  studentName: string;
  rollNo: string;
  className: string;
  month: string;
  attendancePercentage: number;
  overallGradePercentage: number;
  subjectGrades: { subjectName: string; percentage: number }[];
}

export async function generateProgressReportPdf(data: ProgressReportData): Promise<Buffer> {
  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.title }, 'Monthly Progress Report'),
      React.createElement(
        Text,
        { style: styles.subtitle },
        `${data.studentName} — Roll No ${data.rollNo} — ${data.className} — ${data.month}`
      ),

      React.createElement(
        View,
        null,
        React.createElement(
          View,
          { style: styles.statRow },
          React.createElement(Text, { style: styles.statLabel }, 'Attendance this month:'),
          React.createElement(Text, null, `${data.attendancePercentage}%`)
        ),
        React.createElement(
          View,
          { style: styles.statRow },
          React.createElement(Text, { style: styles.statLabel }, 'Overall grade average:'),
          React.createElement(Text, null, `${data.overallGradePercentage}%`)
        )
      ),

      React.createElement(Text, { style: styles.sectionTitle }, 'Grades by Subject'),
      ...data.subjectGrades.map((s) =>
        React.createElement(
          View,
          { style: styles.row, key: s.subjectName },
          React.createElement(Text, { style: styles.cell }, s.subjectName),
          React.createElement(Text, { style: styles.cell }, `${s.percentage}%`)
        )
      )
    )
  );

  return renderToBuffer(doc);
}
