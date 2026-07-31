export interface ContactInfo {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

export interface ExperienceItem {
  id: string;
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  field?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  details?: string[];
}

export interface ProjectItem {
  id: string;
  name: string;
  tech: string[];
  url?: string;
  bullets: string[];
}

export interface SkillCategory {
  category: string;
  skills: string[];
}

export interface MasterProfile {
  contact: ContactInfo;
  summary?: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  projects: ProjectItem[];
  skills: SkillCategory[];
  certifications?: string[];
}

export interface JdAnalysis {
  jobTitle: string;
  company?: string;
  seniority?: string;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  keywords: string[];
  responsibilities: string[];
  domain?: string;
}

export interface SkillGap {
  skill: string;
  importance: 'must' | 'nice';
  presentInResume: boolean;
  question: string;
}

export interface FitAssessment {
  score: number;
  decision: 'proceed' | 'deny';
  reason: string;
  matchedSkills: string[];
  missingCritical: string[];
}

export type ClarifyingKind = 'gap' | 'prune';

export interface ClarifyingQuestion {
  id: string;
  /** gap = missing JD skill; prune = resume skill that may be off-role */
  kind: ClarifyingKind;
  skill: string;
  importance: 'must' | 'nice';
  question: string;
  /** Why this skill looks off-JD (prune only) */
  reason?: string;
}

export interface UserAnswer {
  questionId: string;
  skill: string;
  kind?: ClarifyingKind;
  /**
   * gap: true = candidate has the skill; false = does not.
   * prune: true = keep on tailored resume; false = remove.
   */
  hasSkill: boolean;
  details?: string;
}

export interface TailoredResume {
  contact: ContactInfo;
  summary: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  projects: ProjectItem[];
  skills: SkillCategory[];
  certifications?: string[];
}

export interface PageOptimizationResult {
  pageCount: number;
  density: 'sparse' | 'balanced' | 'tight' | 'overflow';
  strategy: 'none' | 'reduce_spacing' | 'trim_content' | 'expand_spacing' | 'add_detail';
  iterations: number;
  notes: string[];
  spacing?: string;
}
