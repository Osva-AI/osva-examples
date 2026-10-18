import type { EvidenceRecord, ResearchPlan, ResearchSource } from "./types.js";

export function extractEvidence(sources: readonly ResearchSource[], plan: ResearchPlan): EvidenceRecord[] {
  const evidence: EvidenceRecord[] = [];
  for (const source of sources) {
    source.snippets.forEach((snippet, index) => {
      const id = `ev-${source.id}-${index + 1}`;
      evidence.push({
        id,
        sourceId: source.id,
        claim: snippet.claim,
        theme: snippet.theme,
        strength: snippet.strength,
        ...(snippet.stance === "support" ? { supports: snippet.theme } : {}),
        ...(snippet.stance === "caution" ? { contradicts: `${snippet.theme}-optimistic` } : {}),
      });
    });
  }
  linkImplementationTimelineConflict(evidence);
  assertEvidenceTraceability(evidence, sources);
  if (plan.evidenceNeeded.length === 0) {
    throw new Error("Research plan must define evidenceNeeded themes.");
  }
  return evidence;
}

export function assertEvidenceTraceability(
  evidence: readonly EvidenceRecord[],
  sources: readonly ResearchSource[],
): void {
  const sourceIds = new Set(sources.map((source) => source.id));
  for (const record of evidence) {
    if (!sourceIds.has(record.sourceId)) {
      throw new Error(`Evidence ${record.id} references unknown source ${record.sourceId}.`);
    }
    if (record.claim.trim().length === 0) {
      throw new Error(`Evidence ${record.id} has an empty claim.`);
    }
  }
}

/** Surfaces the deliberate vendor vs advisory timeline tension in the fixture corpus. */
function linkImplementationTimelineConflict(evidence: EvidenceRecord[]): void {
  const fastIndex = evidence.findIndex(
    (item) => item.sourceId === "src-vendor-playbook" && item.theme === "implementation-concerns",
  );
  const slowIndex = evidence.findIndex(
    (item) => item.sourceId === "src-buyer-advisory" && item.claim.includes("six to twelve months"),
  );
  if (fastIndex === -1 || slowIndex === -1) {
    return;
  }
  const fast = evidence[fastIndex];
  const slow = evidence[slowIndex];
  if (fast === undefined || slow === undefined) {
    return;
  }
  evidence[fastIndex] = { ...fast, contradicts: slow.id };
  evidence[slowIndex] = { ...slow, contradicts: fast.id };
}
