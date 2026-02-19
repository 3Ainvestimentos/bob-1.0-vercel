export interface MetricsSummaryItem {
  month: string;
  closed: boolean;
  adoption: { mau: number; mau_percent: number };
  volume: { total_analyses: number };
  intensity: { analyses_per_assessor_avg: number };
  quality: {
    ultra_batch_success_rate_pct: number;
    ultra_batch_jobs_completed_rate_pct: number;
  };
  scale: { pct_volume_ultra_batch: number };
  updated_at?: string;
}

export interface MetricsSummaryResponse {
  summaries: MetricsSummaryItem[];
}

const BASE_URL =
  process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';

export async function fetchReportAnalyzerMetricsSummary(
  fromMonth: string,
  toMonth: string
): Promise<MetricsSummaryResponse | { error: string }> {
  const url = `${BASE_URL}/api/report/metrics-summary?from_month=${encodeURIComponent(fromMonth)}&to_month=${encodeURIComponent(toMonth)}`;

  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    return { error: `API ${res.status}: ${text}` };
  }

  return res.json();
}
