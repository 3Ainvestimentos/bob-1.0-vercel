"use client";

import React, { useState, useCallback, useMemo } from 'react';
import type { Meeting } from '@/types';
import { DashboardMetrics } from '@/components/dashboard-metrics';
import { DataTable } from '@/components/data-table';
import { Separator } from '@/components/ui/separator';

const DUMMY_MEETINGS_DATA: Meeting[] = [
  { id: 'm1', name: 'Project Kickoff', date: '2024-08-01T10:00:00Z', attendees: 10, status: 'Scheduled' },
  { id: 'm2', name: 'Sprint Planning', date: '2024-08-05T14:00:00Z', attendees: 8, status: 'Scheduled' },
  { id: 'm3', name: 'Client Demo', date: '2024-07-20T11:00:00Z', attendees: 5, status: 'Completed' },
  { id: 'm4', name: 'Retrospective', date: '2024-08-12T16:00:00Z', attendees: 7, status: 'Scheduled' },
  { id: 'm5', name: 'Stakeholder Update', date: '2024-07-28T09:00:00Z', attendees: 3, status: 'Completed' },
  { id: 'm6', name: 'Design Review', date: '2024-08-15T13:00:00Z', attendees: 6, status: 'Scheduled' },
  { id: 'm7', name: 'Q3 Planning', date: '2024-06-10T10:00:00Z', attendees: 12, status: 'Completed' },
  { id: 'm8', name: 'Cancelled Meeting', date: '2024-08-02T10:00:00Z', attendees: 4, status: 'Cancelled' },
];

export default function DataVisorPage() {
  const [meetingsData] = useState<Meeting[]>(DUMMY_MEETINGS_DATA);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const handleRowSelect = useCallback((id: string, isSelected: boolean) => {
    setSelectedRows(prevSelectedRows => {
      const newSelectedRows = new Set(prevSelectedRows);
      if (isSelected) {
        newSelectedRows.add(id);
      } else {
        newSelectedRows.delete(id);
      }
      return newSelectedRows;
    });
  }, []);

  const handleSelectAll = useCallback((isSelected: boolean) => {
    if (isSelected) {
      setSelectedRows(new Set(meetingsData.map(meeting => meeting.id)));
    } else {
      setSelectedRows(new Set());
    }
  }, [meetingsData]);
  
  const memoizedMeetingsData = useMemo(() => meetingsData, [meetingsData]);

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-8 bg-background">
      <header className="text-center md:text-left">
        <h1 className="text-4xl font-headline font-bold text-primary">DataVisor</h1>
        <p className="text-lg text-muted-foreground mt-1">
          Interactive dashboard for visualizing your meeting data.
        </p>
      </header>

      <section aria-labelledby="dashboard-title">
        <h2 id="dashboard-title" className="text-2xl font-headline font-semibold mb-4 sr-only">
          Dashboard Metrics
        </h2>
        <DashboardMetrics data={memoizedMeetingsData} selectedRows={selectedRows} />
      </section>

      <Separator className="my-6 md:my-8" />

      <section aria-labelledby="data-table-title" className="flex-grow flex flex-col">
        <h2 id="data-table-title" className="text-2xl font-headline font-semibold mb-4">
          Meetings Overview
        </h2>
        <div className="flex-grow">
           <DataTable
            data={memoizedMeetingsData}
            selectedRows={selectedRows}
            onRowSelect={handleRowSelect}
            onSelectAll={handleSelectAll}
          />
        </div>
      </section>
    </div>
  );
}
