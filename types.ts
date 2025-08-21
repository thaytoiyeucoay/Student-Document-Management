export interface Subject {
  id: string;
  name: string;
  // Academic semester identifier, e.g., "2025.1" or "2025.2"
  semester?: string;
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
  recurrenceRule?: {
    type: 'weekly';
    days: number[]; // 1..7 (Mon..Sun)
    from?: string; // ISO date start of recurrence window (00:00)
    until?: string; // ISO date (end date 23:59)
    exceptions?: string[]; // 'YYYY-MM-DD' dates to skip occurrences
  } | null;
}

// PDF Annotation types
export type AnnotationType = 'highlight' | 'underline' | 'strike' | 'note';

export interface Annotation {
  id: string;
  document_id: string;
  page: number;
  type: AnnotationType;
  // Normalized coordinates (0..1 relative to page width/height)
  x: number;
  y: number;
  width: number;
  height: number;
  // Optional multiple rects for text-selection highlights (future use)
  rects?: { x: number; y: number; width: number; height: number }[];
  color?: string;
  comment?: string;
  author_id?: string;
  created_at: string;
  is_deleted?: boolean;
}