"use client";

import type { Meeting } from '@/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface DataTableProps {
  data: Meeting[];
  selectedRows: Set<string>;
  onRowSelect: (id: string, isSelected: boolean) => void;
  onSelectAll: (isSelected: boolean) => void;
}

export function DataTable({ data, selectedRows, onRowSelect, onSelectAll }: DataTableProps) {
  const allSelected = data.length > 0 && selectedRows.size === data.length;
  const someSelected = selectedRows.size > 0 && selectedRows.size < data.length;

  const getStatusVariant = (status: Meeting['status']): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'Scheduled':
        return 'default'; // bg-primary
      case 'Completed':
        return 'secondary'; // bg-secondary
      case 'Cancelled':
        return 'destructive'; // bg-destructive
      default:
        return 'outline';
    }
  };


  return (
    <div className="rounded-md border shadow-sm bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              <Checkbox
                checked={allSelected || (someSelected ? "indeterminate" : false)}
                onCheckedChange={(checked) => onSelectAll(Boolean(checked))}
                aria-label="Select all rows"
              />
            </TableHead>
            <TableHead>Meeting Name</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Attendees</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                No meetings found.
              </TableCell>
            </TableRow>
          ) : (
            data.map((meeting) => (
              <TableRow
                key={meeting.id}
                data-state={selectedRows.has(meeting.id) ? 'selected' : undefined}
                className="transition-colors duration-150 ease-in-out"
              >
                <TableCell>
                  <Checkbox
                    checked={selectedRows.has(meeting.id)}
                    onCheckedChange={(checked) => onRowSelect(meeting.id, Boolean(checked))}
                    aria-label={`Select row for ${meeting.name}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{meeting.name}</TableCell>
                <TableCell>{format(new Date(meeting.date), 'MMM d, yyyy, h:mm a')}</TableCell>
                <TableCell className="text-right">{meeting.attendees}</TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(meeting.status)} className="capitalize">
                    {meeting.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
