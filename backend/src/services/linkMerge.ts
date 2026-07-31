import type { MasterProfile } from '../types/profile.js';

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/[),.;]+$/g, '');
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.startsWith('mailto:')
        ? trimmed
        : `https://${trimmed}`;
    const u = new URL(withProtocol);
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function collectUrls(resumeText: string): string[] {
  const blockMatch = resumeText.match(
    /=== EMBEDDED \/ DETECTED LINKS[\s\S]*?=== END LINKS ===/i
  );
  const searchText = blockMatch?.[0] || resumeText;
  const urls: string[] = [];
  const lineRe = /https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+/gi;
  for (const m of searchText.matchAll(lineRe)) {
    const url = normalizeUrl(m[0]);
    if (url) urls.push(url);
  }
  return [...new Set(urls)];
}

function githubParts(url: string): string[] {
  const lower = url.toLowerCase();
  if (!lower.includes('github.com')) return [];
  return lower
    .replace(/^https?:\/\/(www\.)?github\.com\//, '')
    .split('/')
    .filter(Boolean);
}

/** Merge URLs found in extracted resume text into the structured profile. */
export function mergeDetectedLinksIntoProfile(
  profile: MasterProfile,
  resumeText: string
): MasterProfile {
  const urls = collectUrls(resumeText);
  if (!urls.length) return profile;

  const next: MasterProfile = {
    ...profile,
    contact: { ...profile.contact },
    projects: profile.projects.map((p) => ({ ...p })),
  };

  const assigned = new Set<string>();

  for (const url of urls) {
    const lower = url.toLowerCase();

    if (lower.startsWith('mailto:') && !next.contact.email) {
      next.contact.email = url.replace(/^mailto:/i, '');
      assigned.add(url);
      continue;
    }

    if (lower.includes('linkedin.com') && !next.contact.linkedin) {
      next.contact.linkedin = url;
      assigned.add(url);
      continue;
    }

    const parts = githubParts(url);
    if (parts.length === 1 && !next.contact.github) {
      next.contact.github = url;
      assigned.add(url);
      continue;
    }

    if (parts.length >= 2) {
      if (!next.contact.github) {
        next.contact.github = `https://github.com/${parts[0]}`;
      }
      const repo = parts[1];
      const named = next.projects.find(
        (p) =>
          !p.url &&
          (p.name.toLowerCase().includes(repo) ||
            p.bullets.some((b) => b.toLowerCase().includes(repo)))
      );
      const fallback = next.projects.find((p) => !p.url);
      const target = named || fallback;
      if (target) {
        target.url = url;
        assigned.add(url);
      }
    }
  }

  for (const url of urls) {
    if (assigned.has(url)) continue;
    const lower = url.toLowerCase();
    if (lower.startsWith('mailto:') || lower.includes('linkedin.com')) continue;
    if (lower.includes('github.com') && githubParts(url).length === 1) continue;

    if (
      next.contact.linkedin === url ||
      next.contact.github === url ||
      next.contact.website === url ||
      next.projects.some((p) => p.url === url)
    ) {
      continue;
    }

    const openProject = next.projects.find((p) => !p.url);
    const looksLive =
      lower.includes('vercel.app') ||
      lower.includes('netlify.app') ||
      lower.includes('onrender.com') ||
      lower.includes('railway.app') ||
      lower.includes('pages.dev');

    if (looksLive && openProject) {
      openProject.url = url;
      continue;
    }

    if (!next.contact.website) {
      next.contact.website = url;
      continue;
    }

    if (openProject) {
      openProject.url = url;
    }
  }

  return next;
}
