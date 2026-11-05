/**
 * @param {string} markdown
 * @param {string} [packageName]
 */
export function validateResearchReportMarkdown(markdown, packageName) {
  /** @type {string[]} */
  const problems = [];
  const trimmed = markdown.trim();
  if (trimmed.length === 0) {
    problems.push("artifact body is empty");
  }
  if (!trimmed.includes("# npm research report:")) {
    problems.push('missing heading "# npm research report:"');
  }
  if (!trimmed.includes("## Key findings")) {
    problems.push('missing section "## Key findings"');
  }
  if (!trimmed.includes("## Overall assessment")) {
    problems.push('missing section "## Overall assessment"');
  }
  if (packageName !== undefined && !trimmed.includes(packageName)) {
    problems.push(`expected package name ${packageName} in markdown`);
  }
  if (/osva_ak_[A-Za-z0-9._-]+/.test(trimmed)) {
    problems.push("artifact appears to contain an API key pattern");
  }
  return { ok: problems.length === 0, problems };
}
