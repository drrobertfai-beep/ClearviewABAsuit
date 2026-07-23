// ClearView ABA Suite — VB-MAPP Assessment Form
// Tabbed form covering all 5 VB-MAPP components with auto-scoring.

import { useState, useMemo, useCallback } from "react";
import {
  VB_MAPP_MILESTONES,
  VB_MAPP_BARRIERS,
  VB_MAPP_TRANSITION,
  VB_MAPP_EESA_GROUPS,
  VB_MAPP_TASK_ANALYSIS_DOMAINS,
  initMilestonesScores,
  initBarriersScores,
  initTransitionScores,
  initEESAScores,
  initTaskAnalysisScores,
} from "./VBMAPPData";

// ---- Score types ----

export interface VBMAPPScores {
  milestones: Record<string, Record<string, number[]>>;
  barriers: Record<string, number>;
  transition: Record<string, number>;
  eesa: Record<string, number[]>;
  task_analysis: Record<string, number[]>;
}

export function initVBMAPPScores(): VBMAPPScores {
  return {
    milestones: initMilestonesScores(),
    barriers: initBarriersScores(),
    transition: initTransitionScores(),
    eesa: initEESAScores(),
    task_analysis: initTaskAnalysisScores(),
  };
}

type TabId = "milestones" | "barriers" | "transition" | "eesa" | "task_analysis" | "summary";

const TABS: { id: TabId; label: string }[] = [
  { id: "milestones", label: "Milestones" },
  { id: "barriers", label: "Barriers" },
  { id: "transition", label: "Transition" },
  { id: "eesa", label: "EESA" },
  { id: "task_analysis", label: "Task Analysis" },
  { id: "summary", label: "Summary" },
];

interface VBMAPPFormProps {
  scores: VBMAPPScores;
  onChange: (scores: VBMAPPScores) => void;
  readOnly?: boolean;
}

// ---- Helper: sum an array ----
function sum(arr: number[]): number {
  return arr.reduce((a, v) => a + v, 0);
}

// ---- Score button components ----

function Score012({ value, onChange, readOnly }: { value: number; onChange: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex gap-1">
      {[0, 0.5, 1].map((v) => (
        <button
          key={v}
          type="button"
          disabled={readOnly}
          onClick={() => onChange(v)}
          className={`min-w-[36px] rounded border px-2 py-1 text-xs font-medium transition-colors ${
            value === v
              ? v === 0 ? "bg-red-100 border-red-400 text-red-800"
              : v === 0.5 ? "bg-yellow-100 border-yellow-400 text-yellow-800"
              : "bg-green-100 border-green-400 text-green-800"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
          aria-label={`Score ${v}`}
        >
          {v === 0.5 ? "½" : v}
        </button>
      ))}
    </div>
  );
}

function Score04({ value, onChange, readOnly }: { value: number; onChange: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3, 4].map((v) => (
        <button
          key={v}
          type="button"
          disabled={readOnly}
          onClick={() => onChange(v)}
          className={`min-w-[32px] rounded border px-2 py-1 text-xs font-medium transition-colors ${
            value === v
              ? v <= 1 ? "bg-green-100 border-green-400 text-green-800"
              : v === 2 ? "bg-yellow-100 border-yellow-400 text-yellow-800"
              : "bg-red-100 border-red-400 text-red-800"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
          aria-label={`Score ${v}`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function Score02({ value, onChange, readOnly }: { value: number; onChange: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((v) => (
        <button
          key={v}
          type="button"
          disabled={readOnly}
          onClick={() => onChange(v)}
          className={`min-w-[36px] rounded border px-2 py-1 text-xs font-medium transition-colors ${
            value === v
              ? v === 0 ? "bg-red-100 border-red-400 text-red-800"
              : v === 1 ? "bg-yellow-100 border-yellow-400 text-yellow-800"
              : "bg-green-100 border-green-400 text-green-800"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
          aria-label={`Score ${v}`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function Score01({ value, onChange, readOnly }: { value: number; onChange: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        disabled={readOnly}
        onClick={() => onChange(0)}
        className={`min-w-[36px] rounded border px-2 py-1 text-xs font-medium transition-colors ${
          value === 0 ? "bg-red-100 border-red-400 text-red-800" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
        aria-label="Score 0"
      >
        0
      </button>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => onChange(1)}
        className={`min-w-[36px] rounded border px-2 py-1 text-xs font-medium transition-colors ${
          value === 1 ? "bg-green-100 border-green-400 text-green-800" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
        aria-label="Score 1"
      >
        1
      </button>
    </div>
  );
}

// ---- Milestones Tab ----

function MilestonesTab({ scores, onChange, readOnly }: VBMAPPFormProps) {
  const [expandedLevel, setExpandedLevel] = useState<string>("level1");
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});

  const toggleDomain = (domainKey: string) => {
    setExpandedDomains((prev) => ({ ...prev, [domainKey]: !prev[domainKey] }));
  };

  const updateItem = (level: string, domain: string, idx: number, value: number) => {
    const next = { ...scores };
    next.milestones = { ...next.milestones };
    next.milestones[level] = { ...next.milestones[level] };
    next.milestones[level][domain] = [...next.milestones[level][domain]];
    next.milestones[level][domain][idx] = value;
    onChange(next);
  };

  // Compute totals for display
  const totals = useMemo(() => {
    const result: Record<string, { domainTotals: Record<string, number>; levelTotal: number }> = {};
    for (const [level, domains] of Object.entries(scores.milestones)) {
      let levelTotal = 0;
      const domainTotals: Record<string, number> = {};
      for (const [dk, items] of Object.entries(domains)) {
        const s = sum(items);
        domainTotals[dk] = Math.round(s * 10) / 10;
        levelTotal += s;
      }
      result[level] = { domainTotals, levelTotal: Math.round(levelTotal * 10) / 10 };
    }
    return result;
  }, [scores.milestones]);

  // Overall milestones for sub-header
  let grandTotal = 0;
  let grandCount = 0;
  for (const [, levelData] of Object.entries(totals)) {
    grandTotal += levelData.levelTotal;
  }
  for (const [, domains] of Object.entries(VB_MAPP_MILESTONES)) {
    for (const [, d] of Object.entries(domains)) {
      grandCount += d.items.length;
    }
  }

  const levelLabels = { level1: "Level 1 (0–18 months)", level2: "Level 2 (18–30 months)", level3: "Level 3 (30–48 months)" };

  // Progress indicator per tab
  const completedTabs: Partial<Record<TabId, boolean>> = {};
  for (const [level, domains] of Object.entries(scores.milestones)) {
    let allScored = true;
    for (const items of Object.values(domains)) {
      for (const item of items) {
        if (item === 0 && allScored) {
          // For milestones, we check if anything was touched
        }
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Milestones Assessment</h2>
        <span className="text-sm text-gray-500">
          Total: <strong className="text-indigo-600">{Math.round(grandTotal * 10) / 10}</strong> / {grandCount}
        </span>
      </div>

      {/* Level selector */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {(["level1", "level2", "level3"] as const).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setExpandedLevel(level)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
              expandedLevel === level
                ? "bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {levelLabels[level]}
            <span className="ml-1.5 text-xs text-gray-400">
              ({totals[level]?.levelTotal ?? 0})
            </span>
          </button>
        ))}
      </div>

      {/* Current level domains */}
      {expandedLevel && VB_MAPP_MILESTONES[expandedLevel as keyof typeof VB_MAPP_MILESTONES] && (
        <div className="space-y-2">
          {Object.entries(VB_MAPP_MILESTONES[expandedLevel as keyof typeof VB_MAPP_MILESTONES]).map(([domainKey, domain]) => {
            const items = scores.milestones[expandedLevel]?.[domainKey] ?? [];
            const domainTotal = totals[expandedLevel]?.domainTotals?.[domainKey] ?? 0;
            const maxScore = domain.items.length;
            const isExpanded = expandedDomains[domainKey] !== false; // default open

            return (
              <div key={domainKey} className="rounded-lg border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggleDomain(domainKey)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                    </svg>
                    <span className="text-sm font-medium text-gray-900">{domain.name}</span>
                    <span className="text-xs text-gray-400">({domain.items.length} items)</span>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    domainTotal === maxScore ? "bg-green-100 text-green-700"
                    : domainTotal >= maxScore / 2 ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
                  }`}>
                    {domainTotal} / {maxScore}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                    {domain.items.map((label, idx) => (
                      <div key={idx} className="flex items-start gap-3 py-1">
                        <div className="mt-0.5 flex-shrink-0">
                          <Score012
                            value={items[idx] ?? 0}
                            onChange={(v) => updateItem(expandedLevel, domainKey, idx, v)}
                            readOnly={readOnly}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-700">{label}</span>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">#{idx + 1}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Barriers Tab ----

function BarriersTab({ scores, onChange, readOnly }: VBMAPPFormProps) {
  const updateBarrier = (key: string, value: number) => {
    const next = { ...scores, barriers: { ...scores.barriers, [key]: value } };
    onChange(next);
  };

  const total = useMemo(() => {
    return Object.values(scores.barriers).reduce((a, v) => a + v, 0);
  }, [scores.barriers]);

  const count = VB_MAPP_BARRIERS.length;
  const maxScore = count * 4;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Barriers Assessment</h2>
        <span className="text-sm text-gray-500">
          Total: <strong className={total <= 15 ? "text-green-600" : total <= 30 ? "text-yellow-600" : "text-red-600"}>{total}</strong> / {maxScore}
          {total <= 15 && <span className="ml-1 text-xs text-green-600">(good)</span>}
          {total > 15 && total <= 30 && <span className="ml-1 text-xs text-yellow-600">(moderate)</span>}
          {total > 30 && <span className="ml-1 text-xs text-red-600">(significant)</span>}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500 w-8">#</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Barrier</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500 hidden sm:table-cell">Description</th>
                <th className="px-4 py-2 text-center text-xs font-semibold uppercase text-gray-500 w-48">Score (0–4)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {VB_MAPP_BARRIERS.map((barrier, idx) => {
                const value = scores.barriers[barrier.key] ?? 0;
                return (
                  <tr key={barrier.key} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{barrier.name}</td>
                    <td className="px-4 py-2 text-xs text-gray-500 hidden sm:table-cell">{barrier.description}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-center">
                        <Score04 value={value} onChange={(v) => updateBarrier(barrier.key, v)} readOnly={readOnly} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---- Transition Tab ----

function TransitionTab({ scores, onChange, readOnly }: VBMAPPFormProps) {
  const updateTransition = (key: string, value: number) => {
    const next = { ...scores, transition: { ...scores.transition, [key]: value } };
    onChange(next);
  };

  const total = useMemo(() => {
    return Object.values(scores.transition).reduce((a, v) => a + v, 0);
  }, [scores.transition]);

  const count = VB_MAPP_TRANSITION.length;
  const maxScore = count * 2;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Transition Assessment</h2>
        <span className="text-sm text-gray-500">
          Total: <strong className="text-indigo-600">{total}</strong> / {maxScore}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500 w-8">#</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Item</th>
                <th className="px-4 py-2 text-center text-xs font-semibold uppercase text-gray-500 w-48">
                  Score (0 = No, 1 = Sometimes, 2 = Always)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {VB_MAPP_TRANSITION.map((item, idx) => {
                const value = scores.transition[item.key] ?? 0;
                return (
                  <tr key={item.key} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{item.name}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-center">
                        <Score02 value={value} onChange={(v) => updateTransition(item.key, v)} readOnly={readOnly} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---- EESA Tab ----

function EESATab({ scores, onChange, readOnly }: VBMAPPFormProps) {
  const updateEESA = (groupKey: string, idx: number, value: number) => {
    const next = { ...scores };
    next.eesa = { ...next.eesa };
    next.eesa[groupKey] = [...next.eesa[groupKey]];
    next.eesa[groupKey][idx] = value;
    onChange(next);
  };

  const totals = useMemo(() => {
    const result: Record<string, number> = {};
    let grandTotal = 0;
    for (const [group, items] of Object.entries(scores.eesa)) {
      const s = sum(items);
      result[group] = Math.round(s * 10) / 10;
      grandTotal += s;
    }
    return { groups: result, grandTotal: Math.round(grandTotal * 10) / 10 };
  }, [scores.eesa]);

  const totalItems = VB_MAPP_EESA_GROUPS.reduce((a, g) => a + g.targets.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Early Echoic Skills Assessment (EESA)</h2>
        <span className="text-sm text-gray-500">
          Total: <strong className="text-indigo-600">{totals.grandTotal}</strong> / {totalItems}
        </span>
      </div>

      {VB_MAPP_EESA_GROUPS.map((group, gIdx) => {
        const items = scores.eesa[group.key] ?? [];
        const groupTotal = totals.groups[group.key] ?? 0;

        return (
          <div key={group.key} className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-t-lg border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">{group.name}</h3>
              <span className="text-xs font-medium text-gray-500">
                {groupTotal} / {group.targets.length}
              </span>
            </div>
            <div className="px-4 py-3 space-y-2">
              {group.targets.map((target, idx) => (
                <div key={idx} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-6">{idx + 1}.</span>
                    <span className="text-sm font-mono text-gray-700">/{target}/</span>
                  </div>
                  <Score012
                    value={items[idx] ?? 0}
                    onChange={(v) => updateEESA(group.key, idx, v)}
                    readOnly={readOnly}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Task Analysis Tab ----

function TaskAnalysisTab({ scores, onChange, readOnly }: VBMAPPFormProps) {
  const updateTA = (domainKey: string, idx: number, value: number) => {
    const next = { ...scores };
    next.task_analysis = { ...next.task_analysis };
    next.task_analysis[domainKey] = [...next.task_analysis[domainKey]];
    next.task_analysis[domainKey][idx] = value;
    onChange(next);
  };

  const totals = useMemo(() => {
    const result: Record<string, { completed: number; total: number; pct: number }> = {};
    let grandCompleted = 0;
    let grandTotal = 0;
    for (const [domain, items] of Object.entries(scores.task_analysis)) {
      const c = items.filter((v) => v === 1).length;
      const t = items.length;
      result[domain] = { completed: c, total: t, pct: t > 0 ? Math.round((c / t) * 100) : 0 };
      grandCompleted += c;
      grandTotal += t;
    }
    return { domains: result, overall: grandTotal > 0 ? Math.round((grandCompleted / grandTotal) * 100) : 0 };
  }, [scores.task_analysis]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Task Analysis & Skills Tracking</h2>
        <span className="text-sm text-gray-500">
          Overall: <strong className="text-indigo-600">{totals.overall}%</strong>
        </span>
      </div>

      {VB_MAPP_TASK_ANALYSIS_DOMAINS.map((domain) => {
        const items = scores.task_analysis[domain.key] ?? [];
        const dt = totals.domains[domain.key];

        return (
          <div key={domain.key} className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-t-lg border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">{domain.name}</h3>
              <div className="flex items-center gap-2">
                {/* Progress bar */}
                <div className="h-2 w-24 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${dt?.pct ?? 0}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-500">
                  {dt?.pct ?? 0}% ({dt?.completed ?? 0}/{dt?.total ?? 0})
                </span>
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {domain.skills.map((skill, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50">
                    <span className="text-sm text-gray-700">{skill}</span>
                    <Score01
                      value={items[idx] ?? 0}
                      onChange={(v) => updateTA(domain.key, idx, v)}
                      readOnly={readOnly}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Summary Tab ----

function SummaryTab({ scores }: { scores: VBMAPPScores }) {
  // Milestones summary
  const msTotals = useMemo(() => {
    const result: Record<string, { domainTotals: Record<string, number>; levelTotal: number }> = {};
    let grand = 0;
    let grandMax = 0;
    for (const [level, domains] of Object.entries(VB_MAPP_MILESTONES)) {
      let lt = 0;
      let lMax = 0;
      const dt: Record<string, number> = {};
      for (const [dk, domain] of Object.entries(domains)) {
        const s = sum(scores.milestones[level]?.[dk] ?? []);
        dt[dk] = Math.round(s * 10) / 10;
        lt += s;
        lMax += domain.items.length;
      }
      result[level] = { domainTotals: dt, levelTotal: Math.round(lt * 10) / 10 };
      grand += lt;
      grandMax += lMax;
    }
    return { levels: result, grandTotal: Math.round(grand * 10) / 10, grandMax };
  }, [scores.milestones]);

  const barrierTotal = useMemo(() => sum(Object.values(scores.barriers)), [scores.barriers]);
  const transitionTotal = useMemo(() => sum(Object.values(scores.transition)), [scores.transition]);

  const eesaTotals = useMemo(() => {
    let g = 0;
    let gMax = 0;
    for (const group of VB_MAPP_EESA_GROUPS) {
      const s = sum(scores.eesa[group.key] ?? []);
      g += s;
      gMax += group.targets.length;
    }
    return { total: Math.round(g * 10) / 10, max: gMax };
  }, [scores.eesa]);

  const taTotal = useMemo(() => {
    let c = 0, t = 0;
    for (const [key, items] of Object.entries(scores.task_analysis)) {
      c += items.filter((v) => v === 1).length;
      t += items.length;
    }
    return { completed: c, total: t, pct: t > 0 ? Math.round((c / t) * 100) : 0 };
  }, [scores.task_analysis]);

  const scoreColor = (val: number, max: number, invert?: boolean) => {
    const pct = max > 0 ? val / max : 0;
    if (invert) {
      // For barriers: lower is better
      return pct <= 0.25 ? "text-green-600" : pct <= 0.5 ? "text-yellow-600" : "text-red-600";
    }
    return pct >= 0.75 ? "text-green-600" : pct >= 0.5 ? "text-yellow-600" : "text-red-600";
  };

  const bgColor = (val: number, max: number, invert?: boolean) => {
    const pct = max > 0 ? val / max : 0;
    if (invert) {
      return pct <= 0.25 ? "bg-green-50 border-green-200" : pct <= 0.5 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200";
    }
    return pct >= 0.75 ? "bg-green-50 border-green-200" : pct >= 0.5 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200";
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Assessment Summary</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Milestones card */}
        <div className={`rounded-lg border p-4 ${bgColor(msTotals.grandTotal, msTotals.grandMax)}`}>
          <h3 className="text-sm font-semibold text-gray-700">Milestones</h3>
          <p className={`mt-1 text-2xl font-bold ${scoreColor(msTotals.grandTotal, msTotals.grandMax)}`}>
            {msTotals.grandTotal} <span className="text-sm font-normal text-gray-400">/ {msTotals.grandMax}</span>
          </p>
          <div className="mt-3 space-y-1">
            {Object.entries(msTotals.levels).map(([level, data]) => (
              <div key={level} className="flex justify-between text-xs text-gray-500">
                <span>{level === "level1" ? "L1" : level === "level2" ? "L2" : "L3"}</span>
                <span className="font-medium">{data.levelTotal}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Barriers card */}
        <div className={`rounded-lg border p-4 ${bgColor(barrierTotal, 96, true)}`}>
          <h3 className="text-sm font-semibold text-gray-700">Barriers</h3>
          <p className={`mt-1 text-2xl font-bold ${scoreColor(barrierTotal, 96, true)}`}>
            {barrierTotal} <span className="text-sm font-normal text-gray-400">/ 96</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {barrierTotal <= 15 ? "Low barriers — good prognosis" :
             barrierTotal <= 30 ? "Moderate barriers — intervention recommended" :
             "Significant barriers — intensive intervention needed"}
          </p>
        </div>

        {/* Transition card */}
        <div className={`rounded-lg border p-4 ${bgColor(transitionTotal, 36)}`}>
          <h3 className="text-sm font-semibold text-gray-700">Transition</h3>
          <p className={`mt-1 text-2xl font-bold ${scoreColor(transitionTotal, 36)}`}>
            {transitionTotal} <span className="text-sm font-normal text-gray-400">/ 36</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {transitionTotal >= 27 ? "Ready for less restrictive setting" :
             transitionTotal >= 18 ? "Transition planning recommended" :
             "More intensive programming needed"}
          </p>
        </div>

        {/* EESA card */}
        <div className={`rounded-lg border p-4 ${bgColor(eesaTotals.total, eesaTotals.max)}`}>
          <h3 className="text-sm font-semibold text-gray-700">EESA</h3>
          <p className={`mt-1 text-2xl font-bold ${scoreColor(eesaTotals.total, eesaTotals.max)}`}>
            {eesaTotals.total} <span className="text-sm font-normal text-gray-400">/ {eesaTotals.max}</span>
          </p>
          <div className="mt-3 grid grid-cols-5 gap-1">
            {VB_MAPP_EESA_GROUPS.map((g) => {
              const gs = sum(scores.eesa[g.key] ?? []);
              return (
                <div key={g.key} className="text-center text-xs">
                  <div className={`h-1.5 rounded-full ${gs >= g.targets.length * 0.75 ? "bg-green-400" : gs > 0 ? "bg-yellow-400" : "bg-gray-200"}`} />
                  <span className="text-gray-400">{g.key.replace("group", "G")}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Task Analysis card */}
        <div className={`rounded-lg border p-4 ${bgColor(taTotal.pct, 100)}`}>
          <h3 className="text-sm font-semibold text-gray-700">Task Analysis</h3>
          <p className={`mt-1 text-2xl font-bold ${scoreColor(taTotal.pct, 100)}`}>
            {taTotal.pct}%
          </p>
          <p className="text-xs text-gray-500">{taTotal.completed}/{taTotal.total} skills mastered</p>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Score Breakdown</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Milestones Score</span>
            <span className="font-medium">{msTotals.grandTotal} / {msTotals.grandMax}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Barriers Score</span>
            <span className="font-medium">{barrierTotal} / 96 (lower is better)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Transition Score</span>
            <span className="font-medium">{transitionTotal} / 36</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">EESA Score</span>
            <span className="font-medium">{eesaTotals.total} / {eesaTotals.max}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Task Analysis Completion</span>
            <span className="font-medium">{taTotal.pct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main Form Component ----

export function VBMAPPForm({ scores, onChange, readOnly }: VBMAPPFormProps) {
  const [activeTab, setActiveTab] = useState<TabId>("milestones");

  // Compute tab completion status
  const tabProgress = useMemo(() => {
    const progress: Partial<Record<TabId, { scored: number; total: number }>> = {};

    // Milestones: count non-zero scores
    let msScored = 0, msTotal = 0;
    for (const domains of Object.values(scores.milestones)) {
      for (const items of Object.values(domains)) {
        for (const item of items) {
          if (item > 0) msScored++;
          msTotal++;
        }
      }
    }
    progress.milestones = { scored: msScored, total: msTotal };

    // Barriers: count non-zero (any score != 0 means it was rated)
    const barScored = Object.values(scores.barriers).filter((v) => v !== 0).length;
    progress.barriers = { scored: barScored, total: VB_MAPP_BARRIERS.length };

    // Transition
    const transScored = Object.values(scores.transition).filter((v) => v > 0).length;
    progress.transition = { scored: transScored, total: VB_MAPP_TRANSITION.length };

    // EESA
    let eesaScored = 0, eesaTotal = 0;
    for (const items of Object.values(scores.eesa)) {
      for (const item of items) {
        if (item > 0) eesaScored++;
        eesaTotal++;
      }
    }
    progress.eesa = { scored: eesaScored, total: eesaTotal };

    // Task Analysis
    let taScored = 0, taTotal = 0;
    for (const items of Object.values(scores.task_analysis)) {
      for (const item of items) {
        if (item === 1) taScored++;
        taTotal++;
      }
    }
    progress.task_analysis = { scored: taScored, total: taTotal };

    return progress;
  }, [scores]);

  return (
    <div className="space-y-6">
      {/* Tab bar with progress indicators */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-1 overflow-x-auto" aria-label="Assessment sections">
          {TABS.map((tab) => {
            const prog = tabProgress[tab.id];
            const pct = prog && prog.total > 0 ? Math.round((prog.scored / prog.total) * 100) : 0;
            const isComplete = pct === 100;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? "border-indigo-600 text-indigo-600"
                    : isComplete
                    ? "border-green-300 text-green-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {tab.label}
                {prog && prog.total > 0 && (
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium ${
                    isComplete ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {pct}%
                  </span>
                )}
                {isComplete && (
                  <svg className="h-3.5 w-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab panels */}
      <div className="min-h-[400px]">
        {activeTab === "milestones" && <MilestonesTab scores={scores} onChange={onChange} readOnly={readOnly} />}
        {activeTab === "barriers" && <BarriersTab scores={scores} onChange={onChange} readOnly={readOnly} />}
        {activeTab === "transition" && <TransitionTab scores={scores} onChange={onChange} readOnly={readOnly} />}
        {activeTab === "eesa" && <EESATab scores={scores} onChange={onChange} readOnly={readOnly} />}
        {activeTab === "task_analysis" && <TaskAnalysisTab scores={scores} onChange={onChange} readOnly={readOnly} />}
        {activeTab === "summary" && <SummaryTab scores={scores} />}
      </div>
    </div>
  );
}
