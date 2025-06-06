export interface Meeting {
  id: string;
  name: string;
  date: string; // ISO string format
  attendees: number;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
}
