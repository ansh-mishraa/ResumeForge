import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

const TOKEN_KEY = 'rf_token';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface ProfileSummary {
  id: string;
  label: string;
  name: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { sessions: number };
}

export interface ClarifyingQuestion {
  id: string;
  skill: string;
  importance: 'must' | 'nice';
  question: string;
}

export interface SessionSummary {
  id: string;
  profileId: string;
  jobTitle?: string | null;
  company?: string | null;
  status: string;
  fitScore?: number | null;
  atsScore?: number | null;
  createdAt: string;
  hasLatex?: boolean;
  profile?: { id: string; name: string; label?: string };
}

export interface TailorSession {
  id: string;
  profileId: string;
  jobTitle?: string | null;
  company?: string | null;
  jobDescription: string;
  status: string;
  fitScore?: number | null;
  fitReason?: string | null;
  clarifyingQs?: ClarifyingQuestion[] | null;
  tailoredContent?: {
    contact: {
      name: string;
      email?: string;
      phone?: string;
      location?: string;
      linkedin?: string;
      github?: string;
      website?: string;
    };
    summary?: string;
    experience: Array<{
      id: string;
      company: string;
      title: string;
      location?: string;
      startDate: string;
      endDate: string;
      bullets: string[];
    }>;
    education: Array<{
      id: string;
      school: string;
      degree: string;
      field?: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      details?: string[];
    }>;
    projects: Array<{
      id: string;
      name: string;
      tech: string[];
      url?: string;
      bullets: string[];
    }>;
    skills: Array<{ category: string; skills: string[] }>;
    certifications?: string[];
  } | null;
  latexCode?: string | null;
  pdfPath?: string | null;
  atsScore?: number | null;
  pageOptimization?: {
    pageCount?: number;
    density?: string;
    strategy?: string;
    spacing?: string;
    notes?: string[];
    ats?: {
      score: number;
      matchedKeywords: string[];
      missingKeywords: string[];
      notes: string[];
    };
  } | null;
  errorMessage?: string | null;
  profile?: { id: string; name: string; email?: string | null; label?: string };
}

function unwrap<T>(payload: { success: boolean; data: T }): T {
  return payload.data;
}

export function apiErrorMessage(err: unknown, fallback: string) {
  return (
    (err as { response?: { data?: { error?: { message?: string } } } })?.response
      ?.data?.error?.message ||
    (err instanceof Error ? err.message : fallback)
  );
}

export async function register(email: string, password: string, name?: string) {
  const { data } = await api.post('/auth/register', { email, password, name });
  const result = unwrap(data) as { user: AuthUser; token: string };
  setStoredToken(result.token);
  return result;
}

export async function login(email: string, password: string) {
  const { data } = await api.post('/auth/login', { email, password });
  const result = unwrap(data) as { user: AuthUser; token: string };
  setStoredToken(result.token);
  return result;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    setStoredToken(null);
  }
}

export async function getMe() {
  const { data } = await api.get('/auth/me');
  return unwrap(data) as { user: AuthUser };
}

export async function listProfiles() {
  const { data } = await api.get<{ success: boolean; data: ProfileSummary[] }>('/profiles');
  return unwrap(data);
}

export async function createProfileFromText(resumeText: string, label: string) {
  const { data } = await api.post('/profiles/text', { resumeText, label });
  return unwrap(data) as { id: string; label: string; name: string };
}

export async function uploadResume(file: File, label: string) {
  const form = new FormData();
  form.append('resume', file);
  form.append('label', label);
  const { data } = await api.post('/profiles/upload', form);
  return unwrap(data) as { id: string; label: string; name: string };
}

export async function renameProfile(id: string, label: string) {
  const { data } = await api.patch(`/profiles/${id}/label`, { label });
  return unwrap(data) as { id: string; label: string; name: string };
}

export async function deleteProfile(id: string) {
  const { data } = await api.delete(`/profiles/${id}`);
  return unwrap(data) as { deleted: boolean };
}

export async function listSessions(profileId?: string) {
  const { data } = await api.get<{ success: boolean; data: SessionSummary[] }>(
    '/tailor/sessions',
    { params: profileId ? { profileId } : undefined }
  );
  return unwrap(data);
}

export async function startTailorSession(profileId: string, jobDescription: string) {
  const { data } = await api.post<{ success: boolean; data: TailorSession }>(
    '/tailor/sessions',
    { profileId, jobDescription }
  );
  return unwrap(data);
}

export async function getSession(sessionId: string) {
  const { data } = await api.get<{ success: boolean; data: TailorSession }>(
    `/tailor/sessions/${sessionId}`
  );
  return unwrap(data);
}

export async function submitAnswers(
  sessionId: string,
  answers: {
    questionId: string;
    skill: string;
    hasSkill: boolean;
    details?: string;
  }[]
) {
  const { data } = await api.post<{ success: boolean; data: TailorSession }>(
    `/tailor/sessions/${sessionId}/answers`,
    { answers }
  );
  return unwrap(data);
}

export async function fitSessionToPage(sessionId: string) {
  const { data } = await api.post<{ success: boolean; data: TailorSession }>(
    `/tailor/sessions/${sessionId}/fit-page`
  );
  return unwrap(data);
}

export async function downloadLatex(sessionId: string) {
  const { data } = await api.get<string>(`/tailor/sessions/${sessionId}/latex`, {
    responseType: 'text',
  });
  return data;
}

export async function downloadPdfBlob(sessionId: string) {
  const { data } = await api.get<Blob>(`/tailor/sessions/${sessionId}/pdf`, {
    responseType: 'blob',
  });
  return data;
}
