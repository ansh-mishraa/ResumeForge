import { prisma } from '../lib/db.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors.js';
import { parseResumeToProfile } from '../agents/analyzeAgent.js';
import type { MasterProfile } from '../types/profile.js';
import { extractTextFromFile } from './resumeIngest.js';
import { mergeDetectedLinksIntoProfile } from './linkMerge.js';
import { fromJson, toJson } from '../utils/json.js';

function serializeProfile(row: {
  id: string;
  userId: string | null;
  label: string;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  website: string | null;
  summary: string | null;
  rawResume: string | null;
  data: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    data: fromJson<MasterProfile>(row.data, {
      contact: { name: row.name },
      experience: [],
      education: [],
      projects: [],
      skills: [],
    }),
  };
}

function requireLabel(label?: string) {
  const trimmed = label?.trim() || '';
  if (trimmed.length < 2) {
    throw new ValidationError('Give this resume a name (at least 2 characters)');
  }
  if (trimmed.length > 80) {
    throw new ValidationError('Resume name must be 80 characters or fewer');
  }
  return trimmed;
}

export class ProfileService {
  static async createFromText(
    userId: string,
    resumeText: string,
    label: string
  ) {
    if (!resumeText.trim()) {
      throw new ValidationError('Resume text is required');
    }
    const resumeLabel = requireLabel(label);

    const data = mergeDetectedLinksIntoProfile(
      await parseResumeToProfile(resumeText),
      resumeText
    );

    const row = await prisma.profile.create({
      data: {
        userId,
        label: resumeLabel,
        name: data.contact.name,
        email: data.contact.email,
        phone: data.contact.phone,
        location: data.contact.location,
        linkedin: data.contact.linkedin,
        github: data.contact.github,
        website: data.contact.website,
        summary: data.summary,
        rawResume: resumeText,
        data: toJson(data),
      },
    });
    return serializeProfile(row);
  }

  static async createFromFile(
    userId: string,
    filePath: string,
    mimeType: string,
    originalName: string,
    label: string
  ) {
    const text = await extractTextFromFile(filePath, mimeType, originalName);
    return this.createFromText(userId, text, label);
  }

  static async list(userId: string) {
    return prisma.profile.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        label: true,
        name: true,
        email: true,
        updatedAt: true,
        createdAt: true,
        _count: { select: { sessions: true } },
      },
    });
  }

  static async getById(userId: string, id: string) {
    const profile = await prisma.profile.findFirst({ where: { id, userId } });
    if (!profile) throw new NotFoundError('Profile not found');
    return serializeProfile(profile);
  }

  static async assertOwned(userId: string, id: string) {
    const profile = await prisma.profile.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!profile) throw new ForbiddenError('Profile not found or not yours');
  }

  static async rename(userId: string, id: string, label: string) {
    await this.getById(userId, id);
    const resumeLabel = requireLabel(label);
    const row = await prisma.profile.update({
      where: { id },
      data: { label: resumeLabel },
    });
    return serializeProfile(row);
  }

  static async updateData(userId: string, id: string, data: MasterProfile) {
    await this.getById(userId, id);
    const row = await prisma.profile.update({
      where: { id },
      data: {
        name: data.contact.name,
        email: data.contact.email,
        phone: data.contact.phone,
        location: data.contact.location,
        linkedin: data.contact.linkedin,
        github: data.contact.github,
        website: data.contact.website,
        summary: data.summary,
        data: toJson(data),
      },
    });
    return serializeProfile(row);
  }

  static async delete(userId: string, id: string) {
    await this.getById(userId, id);
    await prisma.profile.delete({ where: { id } });
  }
}
