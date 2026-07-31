import { tailorResume } from '../agents/tailorAgent.js';
import {
  renderLatex,
  SPACING_ORDER,
  type SpacingPreset,
} from './latexRenderer.js';
import {
  compileLatexToPdf,
  estimateDensity,
  getPdfPageCount,
} from './pdfCompiler.js';
import type {
  JdAnalysis,
  MasterProfile,
  PageOptimizationResult,
  TailoredResume,
  UserAnswer,
} from '../types/profile.js';

export async function optimizeSinglePage(params: {
  profile: MasterProfile;
  analysis: JdAnalysis;
  answers: UserAnswer[];
  sessionId: string;
}): Promise<{
  tailored: TailoredResume;
  latex: string;
  pdfPath: string | null;
  optimization: PageOptimizationResult & { spacing?: SpacingPreset };
}> {
  const notes: string[] = [];
  let densityHint: 'sparse' | 'balanced' | 'tight' | 'overflow' = 'balanced';
  let spacing: SpacingPreset = 'normal';
  let tailored = await tailorResume({
    profile: params.profile,
    analysis: params.analysis,
    answers: params.answers,
    densityHint,
  });
  let latex = renderLatex(tailored, spacing);
  let pdfPath: string | null = null;
  let pageCount = 1;
  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    iterations += 1;
    const compiled = await compileLatexToPdf(
      latex,
      `${params.sessionId}-v${iterations}`
    );

    if (compiled) {
      pdfPath = compiled.pdfPath;
      pageCount = await getPdfPageCount(compiled.pdfPath);
      notes.push(
        `Iteration ${iterations}: compiled PDF with ${pageCount} page(s), spacing=${spacing}`
      );

      if (pageCount > 1) {
        const idx = SPACING_ORDER.indexOf(spacing);
        if (idx < SPACING_ORDER.length - 1) {
          spacing = SPACING_ORDER[idx + 1];
          latex = renderLatex(tailored, spacing);
          notes.push(`Reduced spacing only to ${spacing} (content unchanged)`);
          continue;
        }
        notes.push(
          'Already at densest spacing; content preserved for keyword integrity.'
        );
        break;
      }

      const dens = estimateDensity(latex);
      if (dens === 'sparse' && spacing !== 'airy') {
        spacing = 'airy';
        latex = renderLatex(tailored, spacing);
        notes.push('Expanded spacing to fill page');
        continue;
      }
      break;
    }

    const dens = estimateDensity(latex);
    notes.push(
      `Iteration ${iterations}: no LaTeX engine, density=${dens}, spacing=${spacing}`
    );
    if (dens === 'overflow') {
      const idx = SPACING_ORDER.indexOf(spacing);
      if (idx < SPACING_ORDER.length - 1) {
        spacing = SPACING_ORDER[idx + 1];
        latex = renderLatex(tailored, spacing);
        notes.push(`Heuristic densify to ${spacing} (content unchanged)`);
        continue;
      }
    }
    if (dens === 'sparse' && spacing !== 'airy') {
      spacing = 'airy';
      latex = renderLatex(tailored, spacing);
      continue;
    }
    break;
  }

  const finalDensity = estimateDensity(latex);
  return {
    tailored,
    latex,
    pdfPath,
    optimization: {
      pageCount,
      density: finalDensity,
      strategy: 'reduce_spacing',
      iterations,
      notes,
      spacing,
    },
  };
}
