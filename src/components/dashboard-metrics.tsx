"use client";

import type { Meeting } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, ListFilter, CalendarCheck, Users } from 'lucide-react';

interface DashboardMetricsProps {
  data: Meeting[];
  selectedRows: Set<string>;
}

export function DashboardMetrics({ data, selectedRows }: DashboardMetricsProps) {
  const relevantData = selectedRows.size > 0 ? data.filter(item => selectedRows.has(item.id)) : data;

  const totalRecords = data.length;
  const currentlyDisplayingCount = relevantData.length;
  const scheduledMeetingsCount = relevantData.filter(m => m.status === 'Scheduled').length;
  const totalAttendeesCount = relevantData.reduce((sum, m) => sum + m.attendees, 0);

  const metrics = [
    {
      id: 'total-records',
      title: 'Total Records',
      value: totalRecords,
      icon: Database,
      description: 'All meetings in the dataset',
    },
    {
      id: 'currently-displaying',
      title: selectedRows.size > 0 ? 'Selected Meetings' : 'All Meetings Displayed',
      value: currentlyDisplayingCount,
      icon: ListFilter,
      description: selectedRows.size > 0 ? 'Metrics for selected meetings' : 'Metrics for all meetings',
    },
    {
      id: 'scheduled-meetings',
      title: 'Scheduled Meetings',
      value: scheduledMeetingsCount,
      icon: CalendarCheck,
      description: `From ${selectedRows.size > 0 ? 'selected' : 'all'} records`,
    },
    {
      id: 'total-attendees',
      title: 'Total Attendees',
      value: totalAttendeesCount,
      icon: Users,
      description: `In ${selectedRows.size > 0 ? 'selected' : 'all'} meetings`,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map(metric => (
        <Card key={metric.id} className="transition-all duration-300 ease-in-out hover:shadow-lg hover:scale-[1.03] dark:hover:shadow-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
            <metric.icon className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metric.value}</div>
            <p className="text-xs text-muted-foreground pt-1">{metric.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
