import type { Document, Subject, ScheduleItem } from '../types';
import type { Annotation } from '../types';

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
  return { id: s.id, name: s.name, semester: s.semester, describes: s.describes } as any;
}

export const api = {
  hasBackend,
  // AI helpers
  async aiTranslate(payload: { text: string; target_lang?: string; return_format?: 'text' | 'markdown' }): Promise<{ translated: string; model: string }>
  {
    return await request(`/ai/translate`, {
      method: 'POST',
      body: JSON.stringify({
        text: payload.text,
        target_lang: payload.target_lang ?? 'vi',
        return_format: payload.return_format ?? 'markdown',
      }),
    });
  },
  async aiOcrTranslate(payload: { blob: Blob; filename: string; target_lang?: string; mode?: 'ocr' | 'translate' | 'both'; return_format?: 'text' | 'markdown' }): Promise<{ ocr_text?: string; translated?: string; model: string }>
  {
    const form = new FormData();
    form.append('file', new File([payload.blob], payload.filename));
    form.append('target_lang', payload.target_lang ?? 'vi');
    form.append('mode', payload.mode ?? 'both');
    form.append('return_format', payload.return_format ?? 'markdown');
    return await request(`/ai/ocr_translate`, { method: 'POST', body: form });
  },
  async aiImagesToPdf(files: File[]): Promise<Blob> {
    if (!hasBackend()) throw new Error('Backend not configured');
    if (!Array.isArray(files) || files.length === 0) throw new Error('Chọn ít nhất 1 ảnh');
    const form = new FormData();
    for (const f of files) form.append('files', f);
    const res = await fetch(`${apiBase}/ai/images_to_pdf`, { method: 'POST', body: form });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${txt}`);
    }
    return await res.blob();
  },
  async aiFreeOcr(
    files: File[],
    lang: string = 'vie',
    opts?: { psm?: number; oem?: number; preprocess?: 'none' | 'binary' | 'adaptive' | 'enhance'; upscale?: number }
  ): Promise<{ ok: boolean; lang: string; pages: { filename: string; text: string; chars: number }[]; text: string; engine: string }>
  {
    if (!hasBackend()) throw new Error('Backend not configured');
    if (!Array.isArray(files) || files.length === 0) throw new Error('Chọn ít nhất 1 ảnh');
    const form = new FormData();
    for (const f of files) form.append('files', f);
    form.append('lang', lang);
    if (opts?.psm != null) form.append('psm', String(opts.psm));
    if (opts?.oem != null) form.append('oem', String(opts.oem));
    if (opts?.preprocess) form.append('preprocess', opts.preprocess);
    if (opts?.upscale != null) form.append('upscale', String(opts.upscale));
    const res = await fetch(`${apiBase}/ai/free_ocr`, { method: 'POST', body: form });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${txt}`);
    }
    return await res.json();
  },
  async ragQuery(params: { query: string; subjectId?: string; topK?: number; tags?: string[]; author?: string; timeFrom?: string; timeTo?: string }): Promise<{ answer: string; contexts: Array<string | { title?: string; url?: string; page?: number | string; snippet?: string }> }> {
    const body: any = { query: params.query, top_k: params.topK ?? 5 };
    if (params.subjectId) body.subject_id = params.subjectId;
    if (params.tags && params.tags.length) body.tags = params.tags;
    if (params.author) body.author = params.author;
    if (params.timeFrom) body.time_from = params.timeFrom;
    if (params.timeTo) body.time_to = params.timeTo;
    const data = await request<any>(`/rag/query`, { method: 'POST', body: JSON.stringify(body) });
    const ctx = Array.isArray(data.contexts) ? data.contexts : [];
    return { answer: data.answer as string, contexts: ctx };
  },
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
      recurrenceRule: s.recurrence_rule ?? null,
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
      recurrence_rule: payload.recurrenceRule ?? undefined,
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
      recurrenceRule: s.recurrence_rule ?? null,
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
      recurrence_rule: patch.recurrenceRule,
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
      recurrenceRule: s.recurrence_rule ?? null,
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
  async createSubject(name: string, describes?: string, semester?: string): Promise<Subject> {
    const data = await request<any>(`/subjects`, {
      method: 'POST',
      body: JSON.stringify({ name, describes, semester }),
    });
    return mapSubjectFromApi(data);
  },
  async updateSubject(subject: Subject): Promise<Subject> {
    const data = await request<any>(`/subjects/${subject.id}` , {
      method: 'PATCH',
      body: JSON.stringify({ name: subject.name, describes: (subject as any).describes, semester: (subject as any).semester }),
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
      // Pass user's preference to index into RAG
      form.append('enable_rag', String(Boolean((doc as any).enableRag)));
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

  // RAG jobs
  async ragJobStatus(docId: string): Promise<{ doc_id: string; stage: string; progress: number; message?: string; updated_at?: number }>
  {
    return await request(`/rag/jobs/${encodeURIComponent(docId)}`);
  },
  async ragIndexNow(docId: string): Promise<{ ok: boolean; doc_id: string }>
  {
    return await request(`/rag/index/${encodeURIComponent(docId)}`, { method: 'POST' });
  },

  // Annotations
  async listAnnotations(documentId: string): Promise<Annotation[]> {
    if (!hasBackend()) {
      try {
        const raw = localStorage.getItem('annotations');
        const arr = raw ? (JSON.parse(raw) as Annotation[]) : [];
        return arr.filter(a => a.document_id === documentId && !a.is_deleted);
      } catch {
        return [];
      }
    }
    const data = await request<any[]>(`/annotations?document_id=${encodeURIComponent(documentId)}`);
    return data as Annotation[];
  },
  async createAnnotation(payload: Omit<Annotation, 'id' | 'created_at' | 'is_deleted'> & { is_deleted?: boolean }): Promise<Annotation> {
    if (!hasBackend()) {
      const newAnno: Annotation = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        is_deleted: false,
        ...payload,
      } as Annotation;
      try {
        const raw = localStorage.getItem('annotations');
        const arr = raw ? (JSON.parse(raw) as Annotation[]) : [];
        arr.unshift(newAnno);
        localStorage.setItem('annotations', JSON.stringify(arr));
      } catch {}
      return newAnno;
    }
    const data = await request<any>(`/annotations`, { method: 'POST', body: JSON.stringify(payload) });
    return data as Annotation;
  },
  async updateAnnotation(id: string, patch: Partial<Annotation>): Promise<Annotation> {
    if (!hasBackend()) {
      try {
        const raw = localStorage.getItem('annotations');
        const arr = raw ? (JSON.parse(raw) as Annotation[]) : [];
        const idx = arr.findIndex(a => a.id === id);
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], ...patch } as Annotation;
          localStorage.setItem('annotations', JSON.stringify(arr));
          return arr[idx];
        }
      } catch {}
      throw new Error('Annotation not found');
    }
    const data = await request<any>(`/annotations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    return data as Annotation;
  },
  async deleteAnnotation(id: string): Promise<void> {
    if (!hasBackend()) {
      try {
        const raw = localStorage.getItem('annotations');
        const arr = raw ? (JSON.parse(raw) as Annotation[]) : [];
        const idx = arr.findIndex(a => a.id === id);
        if (idx >= 0) {
          arr[idx].is_deleted = true;
          localStorage.setItem('annotations', JSON.stringify(arr));
        }
      } catch {}
      return;
    }
    await request(`/annotations/${id}`, { method: 'DELETE' });
  },
};

export default api;
