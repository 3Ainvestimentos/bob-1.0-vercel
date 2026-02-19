'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Users,
  BarChart2,
  Activity,
  CheckCircle2,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  LineChart,
} from 'recharts';
import { getReportAnalyzerMetricsSummary } from '../actions';
import type { MetricsSummaryItem } from '../lib/report_analyzer_metrics_service';

const TARGETS = {
  adoption_mau_percent: 30,
  volume_total_analyses: 10_000,
  intensity_analyses_per_assessor: 30,
  quality_file_success: 90,
  quality_jobs_completed: 98,
  scale_ultra_batch: 30,
} as const;

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const toMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const fromMonth = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}`;
  return { from: fromMonth, to: toMonth };
}

function metricColor(value: number, target: number): string {
  return value >= target ? 'text-green-600' : 'text-red-600';
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export default function ReportAnalyzerMetricsTab() {
  const defaultRange = getDefaultDateRange();
  const [fromMonth, setFromMonth] = useState(defaultRange.from);
  const [toMonth, setToMonth] = useState(defaultRange.to);
  const [summaries, setSummaries] = useState<MetricsSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (from: string, to: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getReportAnalyzerMetricsSummary(from, to);
      if (result && 'error' in result) {
        setError(result.error);
        setSummaries([]);
      } else {
        setSummaries(result.summaries ?? []);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Não foi possível carregar as métricas.';
      setError(message);
      setSummaries([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(fromMonth, toMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    fetchData(fromMonth, toMonth);
  };

  const summaryForCards =
    summaries.length > 0
      ? summaries.find((s) => s.month === toMonth) ?? summaries[summaries.length - 1]
      : null;

  const chartData = summaries.map((s) => ({
    month: s.month,
    'MAU %': s.adoption.mau_percent,
    'Qualidade Arquivo %': s.quality.ultra_batch_success_rate_pct,
    'Qualidade Jobs %': s.quality.ultra_batch_jobs_completed_rate_pct,
    'Escala %': s.scale.pct_volume_ultra_batch,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Intervalo de Meses</CardTitle>
          <CardDescription>
            Selecione o período para visualizar as métricas do Report Analyzer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="ra-from-month">De</Label>
              <Input
                id="ra-from-month"
                type="month"
                value={fromMonth}
                onChange={(e) => setFromMonth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ra-to-month">Até</Label>
              <Input
                id="ra-to-month"
                type="month"
                value={toMonth}
                onChange={(e) => setToMonth(e.target.value)}
              />
            </div>
            <Button onClick={handleSearch}>Buscar</Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      {!error && summaries.length === 0 && (
        <div className="text-center text-muted-foreground py-10">
          Nenhum dado encontrado para o intervalo selecionado.
        </div>
      )}

      {summaryForCards && (
        <>
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Os valores dos cards abaixo referem-se ao mês selecionado em <strong>Até</strong> ({formatMonthLabel(toMonth)}) — não são média do intervalo. A tabela e o gráfico de tendência usam todo o período De–Até.
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Adoção (MAU)</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    'text-2xl font-bold',
                    metricColor(
                      summaryForCards.adoption.mau_percent,
                      TARGETS.adoption_mau_percent
                    )
                  )}
                >
                  {summaryForCards.adoption.mau_percent.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {summaryForCards.adoption.mau} usuários | Meta:{' '}
                  {TARGETS.adoption_mau_percent}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Volume</CardTitle>
                <BarChart2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    'text-2xl font-bold',
                    metricColor(
                      summaryForCards.volume.total_analyses,
                      TARGETS.volume_total_analyses
                    )
                  )}
                >
                  {summaryForCards.volume.total_analyses.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  análises/mês | Meta:{' '}
                  {TARGETS.volume_total_analyses.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Intensidade</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    'text-2xl font-bold',
                    metricColor(
                      summaryForCards.intensity.analyses_per_assessor_avg,
                      TARGETS.intensity_analyses_per_assessor
                    )
                  )}
                >
                  {summaryForCards.intensity.analyses_per_assessor_avg.toFixed(1)}
                </div>
                <p className="text-xs text-muted-foreground">
                  por assessor | Meta: ≥ {TARGETS.intensity_analyses_per_assessor}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Qualidade (Arquivo)
                </CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    'text-2xl font-bold',
                    metricColor(
                      summaryForCards.quality.ultra_batch_success_rate_pct,
                      TARGETS.quality_file_success
                    )
                  )}
                >
                  {summaryForCards.quality.ultra_batch_success_rate_pct.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  sucesso por arquivo | Meta: ≥ {TARGETS.quality_file_success}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Qualidade (Jobs)
                </CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    'text-2xl font-bold',
                    metricColor(
                      summaryForCards.quality.ultra_batch_jobs_completed_rate_pct,
                      TARGETS.quality_jobs_completed
                    )
                  )}
                >
                  {summaryForCards.quality.ultra_batch_jobs_completed_rate_pct.toFixed(
                    1
                  )}
                  %
                </div>
                <p className="text-xs text-muted-foreground">
                  jobs concluídos | Meta: ≥ {TARGETS.quality_jobs_completed}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Escala</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    'text-2xl font-bold',
                    metricColor(
                      summaryForCards.scale.pct_volume_ultra_batch,
                      TARGETS.scale_ultra_batch
                    )
                  )}
                >
                  {summaryForCards.scale.pct_volume_ultra_batch.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  via ultra-batch | Meta: ≥ {TARGETS.scale_ultra_batch}%
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Métricas por Mês</CardTitle>
              <CardDescription>
                Detalhamento mensal das métricas do Report Analyzer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">MAU %</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Intensidade</TableHead>
                      <TableHead className="text-right">
                        Qualidade Arquivo %
                      </TableHead>
                      <TableHead className="text-right">
                        Qualidade Jobs %
                      </TableHead>
                      <TableHead className="text-right">Escala %</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/50 font-medium">
                      <TableCell>Meta</TableCell>
                      <TableCell className="text-right">
                        {TARGETS.adoption_mau_percent}%
                      </TableCell>
                      <TableCell className="text-right">
                        {TARGETS.volume_total_analyses.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ≥ {TARGETS.intensity_analyses_per_assessor}
                      </TableCell>
                      <TableCell className="text-right">
                        ≥ {TARGETS.quality_file_success}%
                      </TableCell>
                      <TableCell className="text-right">
                        ≥ {TARGETS.quality_jobs_completed}%
                      </TableCell>
                      <TableCell className="text-right">
                        ≥ {TARGETS.scale_ultra_batch}%
                      </TableCell>
                      <TableCell>—</TableCell>
                    </TableRow>
                    {summaries.map((s) => (
                      <TableRow key={s.month}>
                        <TableCell className="font-medium">{s.month}</TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            metricColor(
                              s.adoption.mau_percent,
                              TARGETS.adoption_mau_percent
                            )
                          )}
                        >
                          {s.adoption.mau_percent.toFixed(1)}%
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            metricColor(
                              s.volume.total_analyses,
                              TARGETS.volume_total_analyses
                            )
                          )}
                        >
                          {s.volume.total_analyses.toLocaleString()}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            metricColor(
                              s.intensity.analyses_per_assessor_avg,
                              TARGETS.intensity_analyses_per_assessor
                            )
                          )}
                        >
                          {s.intensity.analyses_per_assessor_avg.toFixed(1)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            metricColor(
                              s.quality.ultra_batch_success_rate_pct,
                              TARGETS.quality_file_success
                            )
                          )}
                        >
                          {s.quality.ultra_batch_success_rate_pct.toFixed(1)}%
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            metricColor(
                              s.quality.ultra_batch_jobs_completed_rate_pct,
                              TARGETS.quality_jobs_completed
                            )
                          )}
                        >
                          {s.quality.ultra_batch_jobs_completed_rate_pct.toFixed(
                            1
                          )}
                          %
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            metricColor(
                              s.scale.pct_volume_ultra_batch,
                              TARGETS.scale_ultra_batch
                            )
                          )}
                        >
                          {s.scale.pct_volume_ultra_batch.toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          {s.closed ? (
                            <span className="text-xs text-muted-foreground">
                              Fechado
                            </span>
                          ) : (
                            <span className="text-xs text-blue-500">Aberto</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {summaries.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Tendência</CardTitle>
                <CardDescription>
                  Evolução das métricas percentuais ao longo dos meses.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={chartData}>
                    <XAxis
                      dataKey="month"
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        borderColor: 'hsl(var(--border))',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="MAU %"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Qualidade Arquivo %"
                      stroke="hsl(var(--chart-2, 142 71% 45%))"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Qualidade Jobs %"
                      stroke="hsl(var(--chart-3, 47 100% 50%))"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Escala %"
                      stroke="hsl(var(--chart-4, 280 65% 60%))"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

