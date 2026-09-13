import { useState, useCallback } from "react";
import { Document, Page, View, Text, StyleSheet, Font, pdf } from "@react-pdf/renderer";
import { format } from "date-fns";

Font.register({
  family: "Helvetica",
  fonts: [
    { src: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmEU9fBBc4.woff2", fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 40,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
  },
  subtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  dateRange: {
    fontSize: 11,
    color: "#6b7280",
    textAlign: "right",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#111827",
    marginTop: 24,
    marginBottom: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
    gap: 16,
  },
  statCard: {
    flex: 1,
    minWidth: 120,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#6b7280",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: "Helvetica",
    color: "#111827",
  },
  table: {
    width: "100%",
    marginTop: 8,
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  tableCell: {
    flex: 1,
    padding: 6,
    fontSize: 9,
    color: "#374151",
  },
  tableHeaderCell: {
    flex: 1,
    padding: 6,
    fontSize: 9,
    fontWeight: "bold",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: "bold",
    textAlign: "center",
  },
  badgeGreen: { backgroundColor: "#dcfce7", color: "#166534" },
  badgeYellow: { backgroundColor: "#fef3c7", color: "#92400e" },
  badgeRed: { backgroundColor: "#fee2e2", color: "#991b1b" },
  badgeBlue: { backgroundColor: "#dbeafe", color: "#1e40af" },
  badgeGray: { backgroundColor: "#f3f4f6", color: "#4b5563" },
  chartPlaceholder: {
    height: 150,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  chartPlaceholderText: {
    fontSize: 10,
    color: "#9ca3af",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#9ca3af",
  },
});

interface ReportData {
  type: string;
  countryPerformance?: any;
  drFunnel?: any;
  meetingsAnalytics?: any;
  leadConversion?: any;
  contactCoverage?: any;
  positionChanges?: any;
  engagementHealth?: any;
  heatMap?: any;
  dateRange: { from: string; to: string };
}

function generateCountryPerformancePDF(data: any, dateRange: { from: string; to: string }) {
  const countries = data?.countries ?? [];
  const totalCountries = countries.length;
  const totalContacts = countries.reduce((sum: number, c: any) => sum + c.contactsCount, 0);
  const totalMeetings = countries.reduce((sum: number, c: any) => sum + c.meetingsCount, 0);
  const totalAgreements = countries.reduce((sum: number, c: any) => sum + c.agreementsCount, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Country Performance Report</Text>
            <Text style={styles.subtitle}>Global Diplomatic Relations Platform</Text>
          </View>
          <Text style={styles.dateRange}>
            {format(new Date(), "PPP")}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Executive Summary</Text>
        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Countries</Text>
            <Text style={styles.statValue}>{totalCountries}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Contacts</Text>
            <Text style={styles.statValue}>{totalContacts}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Meetings</Text>
            <Text style={styles.statValue}>{totalMeetings}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Agreements</Text>
            <Text style={styles.statValue}>{totalAgreements}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Country Performance Table</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderCell}>Country</Text>
            <Text style={styles.tableHeaderCell}>Code</Text>
            <Text style={styles.tableHeaderCell}>Region</Text>
            <Text style={styles.tableHeaderCell}>Status</Text>
            <Text style={styles.tableHeaderCell}>Risk</Text>
            <Text style={styles.tableHeaderCell}>Contacts</Text>
            <Text style={styles.tableHeaderCell}>Meetings</Text>
            <Text style={styles.tableHeaderCell}>Agreements</Text>
          </View>
          {data?.countries?.map((c: any) => (
            <View key={c.id} style={styles.tableRow}>
              <Text style={styles.tableCell}>{c.name}</Text>
              <Text style={styles.tableCell}>{c.code}</Text>
              <Text style={styles.tableCell}>{c.region}</Text>
              <Text style={[styles.tableCell, getStatusStyle(c.status)]}>{c.status}</Text>
              <Text style={[styles.tableCell, getRiskStyle(c.riskLevel)]}>{c.riskLevel}</Text>
              <Text style={styles.tableCell}>{c.contactsCount}</Text>
              <Text style={styles.tableCell}>{c.meetingsCount}</Text>
              <Text style={styles.tableCell}>{c.agreementsCount}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>Generated: {format(new Date(), "PPpp")}</Text>
          <Text>Period: {dateRange.from} to {dateRange.to}</Text>
        </View>
      </Page>
    </Document>
  );
}

function generateEngagementHealthPDF(data: any, dateRange: { from: string; to: string }) {
  const health = data?.health ?? [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Engagement Health Report</Text>
            <Text style={styles.subtitle}>Country Engagement Health Scores</Text>
          </View>
          <Text style={styles.dateRange}>
            {format(new Date(), "PPP")}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Health Scores by Country</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderCell}>Country</Text>
            <Text style={styles.tableHeaderCell}>Score</Text>
            <Text style={styles.tableHeaderCell}>Completion %</Text>
            <Text style={styles.tableHeaderCell}>SLA Rate</Text>
            <Text style={styles.tableHeaderCell}>Failure Rate</Text>
            <Text style={styles.tableHeaderCell}>Risk</Text>
            <Text style={styles.tableHeaderCell}>Status</Text>
            <Text style={styles.tableHeaderCell}>Pool</Text>
            <Text style={styles.tableHeaderCell}>Completed</Text>
          </View>
          {data?.health?.map((h: any) => (
            <View key={h.countryId} style={styles.tableRow}>
              <Text style={styles.tableCell}>{h.countryName} ({h.countryCode})</Text>
              <Text style={styles.tableCell}>{h.score ?? "—"}</Text>
              <Text style={styles.tableCell}>{h.completionPct ?? "—"}%</Text>
              <Text style={styles.tableCell}>{h.slaRate ?? "—"}%</Text>
              <Text style={styles.tableCell}>{h.failureRate ?? "—"}%</Text>
              <Text style={[styles.tableCell, getRiskStyle(h.riskLevel)]}>{h.riskLevel}</Text>
              <Text style={styles.tableCell}><Text style={getStatusStyle(h.status)}>{h.status}</Text></Text>
              <Text style={styles.tableCell}>{h.poolCount}</Text>
              <Text style={styles.tableCell}>{h.completedCount}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>Generated: {format(new Date(), "PPpp")}</Text>
          <Text>Period: {dateRange.from} to {dateRange.to}</Text>
        </View>
      </Page>
    </Document>
  );
}

function generateGenericReportPDF(reportType: string, data: any, dateRange: { from: string; to: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{reportType} Report</Text>
            <Text style={styles.subtitle}>Global Diplomatic Relations Platform</Text>
          </View>
          <Text style={styles.dateRange}>
            {format(new Date(), "PPP")}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Report Data</Text>
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartPlaceholderText}>Report PDF generation for {reportType} coming soon</Text>
        </View>

        <View style={styles.footer}>
          <Text>Generated: {format(new Date(), "PPpp")}</Text>
          <Text>Period: {dateRange.from} to {dateRange.to}</Text>
        </View>
      </Page>
    </Document>
  );
}

function getStatusStyle(status: string) {
  switch (status) {
    case "active":
    case "signed":
    case "verified":
    case "completed":
      return styles.badgeGreen;
    case "review":
    case "scheduled":
    case "agreement":
    case "follow_up":
      return styles.badgeYellow;
    case "outdated":
    case "inactive":
    case "archived":
      return styles.badgeRed;
    default:
      return styles.badgeBlue;
  }
}

function getRiskStyle(risk: string) {
  switch (risk) {
    case "high":
      return styles.badgeRed;
    case "medium":
      return styles.badgeYellow;
    default:
      return styles.badgeGreen;
  }
}

export function generateReportPDF(reportType: string, data: any, dateRange: { from: string; to: string }) {
  switch (reportType) {
    case "overview":
      return generateCountryPerformancePDF(data, dateRange);
    case "health":
      return generateEngagementHealthPDF(data, dateRange);
    default:
      return generateGenericReportPDF(reportType, data, dateRange);
  }
}

export function downloadReportPDF(reportType: string, data: any, dateRange: { from: string; to: string }) {
  const doc = generateReportPDF(reportType, data, dateRange);
  pdf(doc).toBlob().then((blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${reportType}-report-${dateRange.from}-to-${dateRange.to}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  });
}