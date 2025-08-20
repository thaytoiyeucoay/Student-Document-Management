export interface Subject {
  id: string;
  name: string;
}

export interface Document {
  id: string;
  subjectId: string;
  name: string;
  describes: string;
  author: string;
  link: string; // For external links
  file?: File; // To hold the uploaded file object temporarily
  fileUrl?: string; // To hold the URL for viewing the uploaded file
  createdAt?: number; // Timestamp for sorting/filtering by date
  favorite?: boolean; // Mark as favorite
  tags?: string[]; // Simple tags for filtering/searching
}

export interface ScheduleItem {
  id: string;
  subjectId?: string | null;
  title?: string | null;
  startsAt: string; // ISO string
  endsAt: string; // ISO string
  location?: string | null;
  note?: string | null;
}