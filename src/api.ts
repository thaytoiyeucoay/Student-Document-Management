import type { Document, Subject, ScheduleItem } from '../types';

const apiBase = import.meta.env.VITE_API_URL as string | undefined;

function hasBackend() {
  return typeof apiBase === 'string' && apiBase.length > 0;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!hasBackend()) throw new Error('Backend not configured');
  const isForm = options.body instanceof FormData;
  const headers = isForm
    ? (options.headers || {})
    : { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
    credentials: 'omit',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${txt}`);
  }
  if (res.status === 204) return undefined as any;
  return res.json() as Promise<T>;
}

// Mapping helpers
function mapDocFromApi(d: any): Document {
  return {
    id: d.id,
    subjectId: d.subject_id ?? d.subjectId,
    name: d.name,
    describes: d.describes ?? '',
    author: d.author ?? '',
    link: d.link ?? '',
    favorite: Boolean(d.favorite),
    tags: Array.isArray(d.tags) ? d.tags : [],
    fileUrl: d.file_url ?? d.fileUrl ?? '',
    createdAt: d.created_at ? new Date(d.created_at).getTime() : (d.createdAt ?? Date.now()),
  } as Document;
}

function mapDocToApi(d: Partial<Document>): any {
  return {
    subject_id: d.subjectId,
    name: d.name,
    describes: d.describes || undefined,
    author: d.author || undefined,
    link: d.link || undefined, // Avoid sending "" which fails AnyHttpUrl
    favorite: d.favorite ?? undefined,
    tags: (d.tags && d.tags.length ? d.tags : undefined),
  };
}

function mapSubjectFromApi(s: any): Subject {
  return { id: s.id, name: s.name, describes: s.describes } as any;
}

export const api = {
  hasBackend,
  // Schedules
  async listSchedules(params: { from: string; to: string; subjectId?: string }): Promise<ScheduleItem[]> {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.subjectId) qs.set('subject_id', params.subjectId);
    const data = await request<any[]>(`/schedules?${qs.toString()}`);
    return data.map((s) => ({
      id: s.id,
      subjectId: s.subject_id ?? s.subjectId ?? null,
      title: s.title ?? null,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      location: s.location ?? null,
      note: s.note ?? null,
    } satisfies ScheduleItem));
  },
  async createSchedule(payload: Omit<ScheduleItem, 'id'>): Promise<ScheduleItem> {
    const body = {
      subject_id: payload.subjectId ?? undefined,
      title: payload.title ?? undefined,
      starts_at: payload.startsAt,
      ends_at: payload.endsAt,
      location: payload.location ?? undefined,
      note: payload.note ?? undefined,
    };
    const s = await request<any>(`/schedules`, { method: 'POST', body: JSON.stringify(body) });
    return {
      id: s.id,
      subjectId: s.subject_id ?? null,
      title: s.title ?? null,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      location: s.location ?? null,
      note: s.note ?? null,
    };
  },
  async updateSchedule(id: string, patch: Partial<Omit<ScheduleItem, 'id'>>): Promise<ScheduleItem> {
    const body: any = {
      subject_id: patch.subjectId,
      title: patch.title,
      starts_at: patch.startsAt,
      ends_at: patch.endsAt,
      location: patch.location,
      note: patch.note,
    };
    Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
    const s = await request<any>(`/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    return {
      id: s.id,
      subjectId: s.subject_id ?? null,
      title: s.title ?? null,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      location: s.location ?? null,
      note: s.note ?? null,
    };
  },
  async deleteSchedule(id: string): Promise<void> {
    await request(`/schedules/${id}`, { method: 'DELETE' });
  },
  // Subjects
  async listSubjects(): Promise<Subject[]> {
    const data = await request<any[]>(`/subjects`);
    return data.map(mapSubjectFromApi);
  },
  async createSubject(name: string, describes?: string): Promise<Subject> {
    const data = await request<any>(`/subjects`, {
      method: 'POST',
      body: JSON.stringify({ name, describes }),
    });
    return mapSubjectFromApi(data);
  },
  async updateSubject(subject: Subject): Promise<Subject> {
    const data = await request<any>(`/subjects/${subject.id}` , {
      method: 'PATCH',
      body: JSON.stringify({ name: subject.name, describes: (subject as any).describes }),
    });
    return mapSubjectFromApi(data);
  },
  async deleteSubject(id: string): Promise<void> {
    await request(`/subjects/${id}`, { method: 'DELETE' });
  },

  // Documents
  async listDocuments(subjectId?: string): Promise<Document[]> {
    const qs = subjectId ? `?subject_id=${encodeURIComponent(subjectId)}` : '';
    const data = await request<any[]>(`/documents${qs}`);
    return data.map(mapDocFromApi);
  },
  async createDocument(doc: Omit<Document, 'id'>): Promise<Document> {
    const payload = mapDocToApi(doc);
    const data = await request<any>(`/documents`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const created = mapDocFromApi(data);
    if (doc.file) {
      const form = new FormData();
      form.append('file', doc.file);
      const up = await request<any>(`/documents/${created.id}/upload`, {
        method: 'POST',
        body: form,
      });
      return mapDocFromApi(up);
    }
    return created;
  },
  async updateDocument(doc: Document): Promise<Document> {
    const data = await request<any>(`/documents/${doc.id}`, {
      method: 'PATCH',
      body: JSON.stringify(mapDocToApi(doc)),
    });
    return mapDocFromApi(data);
  },
  async deleteDocument(id: string): Promise<void> {
    await request(`/documents/${id}`, { method: 'DELETE' });
  },
};

export default api;
