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
import { Loader2, Users, BarChart2, Activity, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getReportAnalyzerMetricsSummary } from '../actions';
import type { MetricsSummaryItem } from '../lib/report_analyzer_metrics_service';

const TARGETS_DIGITAL = {
  mau_percent: 80,
  total_analyses: 2000,
  users_3m_streak: 10,
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

export default function DigitalMetricsTab() {
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
      setError(err instanceof Error ? err.message : 'Erro ao carregar métricas digitais.');
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

  const latestSummary =
    summaries.length > 0
      ? summaries.find((s) => s.month === toMonth) ?? summaries[summaries.length - 1]
      : null;
  const digital = latestSummary?.digital;

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
            Selecione o período para visualizar as métricas do time digital.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="dig-from-month">De</Label>
              <Input
                id="dig-from-month"
                type="month"
                value={fromMonth}
                onChange={(e) => setFromMonth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dig-to-month">Até</Label>
              <Input
                id="dig-to-month"
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

      {!digital && !error && summaries.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Métricas digitais ainda não disponíveis para este período. Execute a re-agregação histórica para populá-las.
        </div>
      )}

      {digital && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">MAU Digital</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{digital.mau}</div>
              <p className="text-xs text-muted-foreground">usuários ativos do time digital</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">MAU% Digital</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  'text-2xl font-bold',
                  metricColor(digital.mau_percent, TARGETS_DIGITAL.mau_percent)
                )}
              >
                {digital.mau_percent.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                do time digital | Meta: ≥ {TARGETS_DIGITAL.mau_percent}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Volume Digital</CardTitle>
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  'text-2xl font-bold',
                  metricColor(digital.total_analyses, TARGETS_DIGITAL.total_analyses)
                )}
              >
                {digital.total_analyses.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                análises | Meta: ≥ {TARGETS_DIGITAL.total_analyses.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Persistência Digital</CardTitle>
              <Repeat className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  'text-2xl font-bold',
                  metricColor(digital.users_3m_streak, TARGETS_DIGITAL.users_3m_streak)
                )}
              >
                {digital.users_3m_streak}
              </div>
              <p className="text-xs text-muted-foreground">
                usuários 3 meses seguidos | Meta: ≥ {TARGETS_DIGITAL.users_3m_streak}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {summaries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico Digital</CardTitle>
            <CardDescription>
              Evolução mensal das métricas do time digital.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">MAU</TableHead>
                    <TableHead className="text-right">MAU%</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Persistência</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell>Meta</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">{TARGETS_DIGITAL.mau_percent}%</TableCell>
                    <TableCell className="text-right">
                      {TARGETS_DIGITAL.total_analyses.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      ≥ {TARGETS_DIGITAL.users_3m_streak}
                    </TableCell>
                    <TableCell>—</TableCell>
                  </TableRow>
                  {summaries.map((s) => {
                    const d = s.digital;
                    return (
                      <TableRow key={s.month}>
                        <TableCell className="font-medium">{s.month}</TableCell>
                        <TableCell className="text-right">
                          {d?.mau ?? '—'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            d
                              ? metricColor(d.mau_percent, TARGETS_DIGITAL.mau_percent)
                              : 'text-muted-foreground'
                          )}
                        >
                          {d ? `${d.mau_percent.toFixed(1)}%` : '—'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            d
                              ? metricColor(d.total_analyses, TARGETS_DIGITAL.total_analyses)
                              : 'text-muted-foreground'
                          )}
                        >
                          {d ? d.total_analyses.toLocaleString() : '—'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            d
                              ? metricColor(d.users_3m_streak, TARGETS_DIGITAL.users_3m_streak)
                              : 'text-muted-foreground'
                          )}
                        >
                          {d?.users_3m_streak ?? '—'}
                        </TableCell>
                        <TableCell>
                          {s.closed ? (
                            <span className="text-xs text-muted-foreground">Fechado</span>
                          ) : (
                            <span className="text-xs text-blue-500">Aberto</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
