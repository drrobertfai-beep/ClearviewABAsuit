// ClearView ABA Suite — VB-MAPP auto-scoring
//
// Single source of truth for the summary scores stored on
// `assessments.raw_scores._computed`. Extracted from the assessment server
// function so that anything writing an assessment — the form's save path, the
// demo seed script, a future import — produces identical numbers.
//
// Plain data-in / data-out: no server imports, safe to use from a CLI script.

/**
 * Compute the summary block stored at `raw_scores._computed`.
 *
 * - milestones: per-domain and per-level totals, plus an overall total (max 170)
 * - barriers:   sum of the 0–4 barrier scores, max = items × 4
 * - transition: sum of the 0–2 transition scores, max = items × 2
 * - eesa:       per-group totals and an overall total
 * - task_analysis: per-domain percentages and an overall percentage
 */
export function computeVBMAPPScoring(
  rawScores: Record<string, unknown>,
): Record<string, unknown> {
  const computed: Record<string, unknown> = {};

  // Milestones: sum item arrays per domain per level
  if (rawScores.milestones && typeof rawScores.milestones === "object") {
    const ms = rawScores.milestones as Record<string, unknown>;
    const totals: Record<string, Record<string, number>> = {};
    const grandTotals: Record<string, number> = {};
    let overallMilestones = 0;

    for (const [level, domains] of Object.entries(ms)) {
      if (!domains || typeof domains !== "object") continue;
      totals[level] = {};
      let levelTotal = 0;

      for (const [domain, items] of Object.entries(
        domains as Record<string, unknown>,
      )) {
        if (Array.isArray(items)) {
          const sum = items.reduce(
            (a: number, v: unknown) => a + (typeof v === "number" ? v : 0),
            0,
          );
          totals[level][domain] = Math.round(sum * 10) / 10;
          levelTotal += sum;
        }
      }
      grandTotals[level] = Math.round(levelTotal * 10) / 10;
      overallMilestones += levelTotal;
    }

    computed.milestones = {
      domainTotals: totals,
      levelTotals: grandTotals,
      overallTotal: Math.round(overallMilestones * 10) / 10,
      maxOverall: 170,
    };
  }

  // Barriers: sum individual scores (0-4 each, 24 items → max 96)
  if (rawScores.barriers && typeof rawScores.barriers === "object") {
    const barriers = rawScores.barriers as Record<string, unknown>;
    let barrierTotal = 0;
    let barrierCount = 0;
    for (const [, score] of Object.entries(barriers)) {
      if (typeof score === "number") {
        barrierTotal += score;
        barrierCount++;
      }
    }
    computed.barriers = {
      total: barrierTotal,
      count: barrierCount,
      max: barrierCount * 4,
    };
  }

  // Transition: sum scores (0-2 each, 18 items → max 36)
  if (rawScores.transition && typeof rawScores.transition === "object") {
    const trans = rawScores.transition as Record<string, unknown>;
    let transTotal = 0;
    let transCount = 0;
    for (const [, score] of Object.entries(trans)) {
      if (typeof score === "number") {
        transTotal += score;
        transCount++;
      }
    }
    computed.transition = {
      total: transTotal,
      count: transCount,
      max: transCount * 2,
    };
  }

  // EESA: sum each group array
  if (rawScores.eesa && typeof rawScores.eesa === "object") {
    const eesa = rawScores.eesa as Record<string, unknown>;
    const groupTotals: Record<string, number> = {};
    let eesaTotal = 0;
    for (const [group, items] of Object.entries(eesa)) {
      if (Array.isArray(items)) {
        const sum = items.reduce(
          (a: number, v: unknown) => a + (typeof v === "number" ? v : 0),
          0,
        );
        groupTotals[group] = Math.round(sum * 10) / 10;
        eesaTotal += sum;
      }
    }
    computed.eesa = {
      groupTotals,
      overallTotal: Math.round(eesaTotal * 10) / 10,
    };
  }

  // Task Analysis: per-domain percentages
  if (rawScores.task_analysis && typeof rawScores.task_analysis === "object") {
    const ta = rawScores.task_analysis as Record<string, unknown>;
    const domainPcts: Record<string, number> = {};
    let taTotalCompleted = 0;
    let taTotalItems = 0;

    for (const [domain, items] of Object.entries(ta)) {
      if (Array.isArray(items)) {
        const completed = items.filter((v) => v === 1).length;
        const total = items.length;
        domainPcts[domain] =
          total > 0 ? Math.round((completed / total) * 100) : 0;
        taTotalCompleted += completed;
        taTotalItems += total;
      }
    }
    computed.task_analysis = {
      domainPercentages: domainPcts,
      overallPercentage:
        taTotalItems > 0
          ? Math.round((taTotalCompleted / taTotalItems) * 100)
          : 0,
      totalCompleted: taTotalCompleted,
      totalItems: taTotalItems,
    };
  }

  return computed;
}
