/**
 * TypeScript types for the CyberForge REST API (/api/v1).
 * They mirror the Pydantic response models in apps/api/cyberforge/schemas.
 * The OpenAPI document at /openapi.json is the source of truth.
 */

// ── primitives ──────────────────────────────────────────────────────────────────────────────
export const SEVERITIES = ["critical", "high", "medium", "low", "informational"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ALERT_STATUSES = [
  "new",
  "investigating",
  "contained",
  "resolved",
  "false_positive",
] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const INVESTIGATION_STATUSES = ["open", "in_progress", "contained", "closed"] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

export type Framework = "attack" | "atlas";
export type RuleFormat = "sigma" | "yara" | "suricata";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type IndicatorType = "ip" | "domain" | "url" | "sha256" | "email" | "cve" | "asn";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ── shared refs ─────────────────────────────────────────────────────────────────────────────
export interface Analyst {
  id: number;
  handle: string;
  name: string;
  role: string;
}

export interface TechniqueRef {
  id: string;
  name: string;
  framework: Framework;
}

export interface Tactic {
  id: string;
  framework: Framework;
  shortname: string;
  name: string;
  description: string;
  url: string;
  position: number;
}

export interface RuleRef {
  id: number;
  slug: string;
  title: string;
  level: Severity;
  format: RuleFormat;
}

export interface LabRef {
  id: number;
  slug: string;
  title: string;
  number: number;
  domain: string;
}

// ── events ──────────────────────────────────────────────────────────────────────────────────
export interface EventSummary {
  id: number;
  timestamp: string;
  source: string;
  category: string;
  host: string | null;
  user: string | null;
  action: string | null;
  outcome: string | null;
  src_ip: string | null;
  message: string;
  synthetic: boolean;
  lab_run_id: number | null;
}

export interface SecurityEvent extends EventSummary {
  logsource: Record<string, string>;
  dst_ip: string | null;
  dst_port: number | null;
  process: string | null;
  parent_process: string | null;
  command_line: string | null;
  raw: string;
  fields: Record<string, unknown>;
  note: string | null;
  dataset: string | null;
}

export interface FacetValue {
  value: string;
  count: number;
}
export type EventFacets = Record<"category" | "source" | "host" | "outcome", FacetValue[]>;

// ── alerts ──────────────────────────────────────────────────────────────────────────────────
export interface AlertSummary {
  id: number;
  title: string;
  severity: Severity;
  status: AlertStatus;
  source: string;
  timestamp: string;
  host: string | null;
  user: string | null;
  rule: RuleRef | null;
  technique: TechniqueRef | null;
  tactic: string | null;
  confidence: number;
  assignee: Analyst | null;
  investigation_id: number | null;
  lab_run_id: number | null;
  synthetic: boolean;
}

export interface Note {
  id: number;
  alert_id: number | null;
  investigation_id: number | null;
  author: Analyst | null;
  body: string;
  created_at: string;
}

export interface InvestigationRef {
  id: number;
  title: string;
  status: InvestigationStatus;
  severity: Severity;
}

export interface AlertDetail extends AlertSummary {
  description: string;
  evidence: {
    match?: MatchTrace[];
    correlation?: Record<string, unknown> | null;
    group?: Record<string, unknown> | null;
    event_count?: number;
    rule?: { slug: string; level: string; correlation: boolean };
  } & Record<string, unknown>;
  events: SecurityEvent[];
  notes: Note[];
  related_alerts: AlertSummary[];
  investigation: InvestigationRef | null;
  lab: LabRef | null;
  latest_ai_analysis: AIAnalysisRecord | null;
  created_at: string;
  updated_at: string;
}

export interface AlertStats {
  total: number;
  by_severity: Partial<Record<Severity, number>>;
  by_status: Partial<Record<AlertStatus, number>>;
  open: number;
}

export interface AlertPatch {
  status?: AlertStatus;
  assignee_id?: number | null;
  investigation_id?: number | null;
}

// ── lifecycle ───────────────────────────────────────────────────────────────────────────────
export interface MatchTrace {
  field: string;
  value: unknown;
  pattern: string;
}

export interface Lifecycle {
  alert: AlertSummary;
  simulation: {
    lab: LabRef | null;
    run_id: number | null;
    description: string;
    narrative: string[];
    synthetic: boolean;
  };
  raw_events: { id: number; timestamp: string; source: string; raw: string; note: string | null }[];
  parsed_events: SecurityEvent[];
  rule: {
    id: number;
    slug: string;
    title: string;
    level: Severity;
    format: RuleFormat;
    description: string;
    content: string;
    logsource: Record<string, unknown>;
    false_positives: string[];
    is_correlation: boolean;
  } | null;
  match: {
    trace: MatchTrace[];
    correlation: Record<string, unknown> | null;
    group: Record<string, unknown> | null;
    explanation: string;
    matched_event_ids: number[];
  };
  mitre: {
    technique: TechniqueRef | null;
    description: string;
    url: string;
    tactics: Tactic[];
    other_techniques: TechniqueRef[];
    mitigations: { id: string; name: string; description: string }[];
  };
  investigation: InvestigationRef | null;
  mitigation: {
    source: "lab" | "mitre" | "none";
    actions: string[];
    analyst_steps: string[];
  };
}

// ── labs ────────────────────────────────────────────────────────────────────────────────────
export interface LabSummary {
  id: number;
  slug: string;
  number: number;
  title: string;
  difficulty: Difficulty;
  category: string;
  domain: string;
  duration_minutes: number;
  summary: string;
  techniques: TechniqueRef[];
  rule_count: number;
  run_count: number;
  last_run_at: string | null;
  requires_containers: boolean;
}

export interface LabDocument {
  slug: string;
  number: number;
  title: string;
  domain: string;
  category: string;
  difficulty: Difficulty;
  duration_minutes: number;
  summary: string;
  tags: string[];
  objectives: string[];
  architecture: {
    description: string;
    diagram: string | null;
    components: { name: string; role: string; network: string }[];
  };
  scenario: string;
  setup: { requires_containers: boolean; compose_profile: string | null; steps: string[] };
  telemetry: {
    sources: { name: string; description: string; log_source: string }[];
    scenario_file: string;
  };
  attack_simulation: { description: string; steps: { title: string; detail: string }[] };
  expected_detection: { description: string; rules: string[] };
  mitre: string[];
  investigation_questions: { question: string; hint: string; answer: string }[];
  mitigation: string[];
  cleanup: string[];
  references: { title: string; url: string }[];
  safety: { scope: string; network: string; allowed_targets: string[] };
}

export interface LabDetail extends LabSummary {
  document: LabDocument;
  rules: RuleRef[];
  scenario_event_count: number;
}

export interface LabRun {
  id: number;
  lab_id: number;
  lab_slug: string;
  lab_title: string;
  status: string;
  mode: string;
  target: string | null;
  started_at: string;
  finished_at: string | null;
  events_generated: number;
  alerts_generated: number;
  synthetic: boolean;
}

export interface LabRunDetail extends LabRun {
  alerts: AlertSummary[];
  event_ids: number[];
  expected_rules: string[];
  fired_rules: string[];
  missing_rules: string[];
}

// ── investigations ─────────────────────────────────────────────────────────────────────────
export interface InvestigationSummary {
  id: number;
  title: string;
  summary: string;
  status: InvestigationStatus;
  severity: Severity;
  lead: Analyst | null;
  lab_slug: string | null;
  created_at: string;
  updated_at: string;
  synthetic: boolean;
  alert_count: number;
  note_count: number;
}

export interface TimelineEntry {
  id: number;
  timestamp: string;
  kind: "detection" | "evidence" | "containment" | "note" | "status";
  title: string;
  detail: string;
  alert_id: number | null;
}

export interface IncidentReport {
  id: number;
  investigation_id: number;
  status: "draft" | "final";
  executive_summary: string;
  timeline: { time: string; event: string }[];
  affected_assets: string[];
  indicators: string[];
  mitre_techniques: string[];
  evidence: string;
  root_cause: string;
  containment: string;
  remediation: string;
  lessons_learned: string;
  updated_at: string;
}

export type ReportUpdate = Omit<IncidentReport, "id" | "investigation_id" | "updated_at">;

export interface InvestigationDetail extends InvestigationSummary {
  alerts: AlertSummary[];
  notes: Note[];
  timeline: TimelineEntry[];
  report: IncidentReport | null;
  techniques: TechniqueRef[];
}

// ── detections ─────────────────────────────────────────────────────────────────────────────
export interface RuleSummary {
  id: number;
  slug: string;
  title: string;
  format: RuleFormat;
  status: string;
  level: Severity;
  enabled: boolean;
  origin: "builtin" | "user";
  is_correlation: boolean;
  author: string;
  logsource: Record<string, unknown>;
  techniques: TechniqueRef[];
  lab_count: number;
  alert_count: number;
  updated_at: string;
}

export interface RuleDetail extends RuleSummary {
  description: string;
  content: string;
  tags: string[];
  false_positives: string[];
  references: string[];
  source_path: string;
  labs: { slug: string; title: string; number: number }[];
  recent_alert_ids: number[];
}

export interface ValidateResponse {
  valid: boolean;
  format: RuleFormat;
  errors: string[];
  warnings: string[];
  meta: {
    title: string;
    id: string | null;
    status: string | null;
    level: string;
    description: string;
    author: string;
    logsource: Record<string, string>;
    tags: string[];
    techniques: string[];
    falsepositives: string[];
    references: string[];
    is_correlation: boolean;
    fields: string[];
  } | null;
  mitre: { id: string; name: string | null; known: boolean }[];
}

export type TranslateTarget = "elastic" | "splunk" | "sentinel" | "opensearch" | "sql";

export interface Translation {
  target: TranslateTarget;
  label: string;
  language: string;
  queries: string[];
  error: string | null;
  notes: string[];
}

export interface TranslateResponse {
  validation: ValidateResponse;
  translations: Translation[];
}

export interface TestResponse {
  valid: boolean;
  errors: string[];
  event_count: number;
  matched_count: number;
  matches: { index: number; matched: boolean; trace: MatchTrace[]; summary: string }[];
  correlation: {
    event_indexes: number[];
    group: Record<string, unknown> | null;
    details: Record<string, unknown>;
  }[];
}

// ── MITRE ───────────────────────────────────────────────────────────────────────────────────
export interface TechniqueCoverage {
  id: string;
  name: string;
  framework: Framework;
  is_subtechnique: boolean;
  parent_id: string | null;
  tactic_ids: string[];
  labs: number;
  rules: number;
  alerts: number;
  investigations: number;
}

export interface TechniqueDetail extends TechniqueCoverage {
  description: string;
  url: string;
  platforms: string[];
  mitigations: { id: string; name: string; description: string }[];
  tactics: Tactic[];
  lab_refs: LabRef[];
  rule_refs: RuleRef[];
  recent_alerts: AlertSummary[];
  sub_techniques: TechniqueCoverage[];
}

export interface Matrix {
  framework: Framework;
  version: string;
  notice: string;
  columns: { tactic: Tactic; techniques: TechniqueCoverage[] }[];
  totals: { techniques: number; covered: number; with_labs: number; with_alerts: number };
}

// ── threat intel ───────────────────────────────────────────────────────────────────────────
export interface Indicator {
  id: number;
  type: IndicatorType;
  value: string;
  tags: string[];
  confidence: number;
  source: string;
  tlp: "clear" | "green" | "amber";
  first_seen: string;
  last_seen: string;
  notes: string;
  synthetic: boolean;
}

export interface IndicatorDetail extends Indicator {
  related_alerts: AlertSummary[];
}

// ── learning ────────────────────────────────────────────────────────────────────────────────
export interface ModuleSummary {
  slug: string;
  track: string;
  position: number;
  title: string;
  summary: string;
  duration_minutes: number;
  day: number | null;
  lab_slugs: string[];
  rule_slugs: string[];
  technique_ids: string[];
}

export interface ModuleDetail extends ModuleSummary {
  body: string;
}

export interface Track {
  slug: string;
  title: string;
  audience: string;
  summary: string;
  icon: string;
  modules: ModuleSummary[];
  total_minutes: number;
}

export interface LearningOverview {
  tracks: Track[];
  thirty_days: Track | null;
}

// ── dashboard ───────────────────────────────────────────────────────────────────────────────
export interface Kpi {
  key: string;
  label: string;
  value: number;
  unit: string | null;
  hint: string | null;
}

export interface TimelinePoint {
  bucket: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  events: number;
}

export interface Dashboard {
  generated_at: string;
  demo_mode: boolean;
  synthetic_notice: string;
  posture_score: number;
  posture_breakdown: Record<string, number>;
  kpis: Kpi[];
  timeline: TimelinePoint[];
  recent_alerts: AlertSummary[];
  recent_investigations: {
    id: number;
    title: string;
    status: InvestigationStatus;
    severity: Severity;
    lead: Analyst | null;
    updated_at: string;
    synthetic: boolean;
  }[];
  lab_progress: { total: number; run: number; active: number };
  coverage: { tactic: Tactic; covered: number; total: number }[];
}

// ── AI ──────────────────────────────────────────────────────────────────────────────────────
export interface AIStatus {
  enabled: boolean;
  provider: string;
  model: string | null;
  reason: string | null;
  safety: string[];
}

export interface AIAnalysisContent {
  summary: string;
  severity_explanation: string;
  likely_technique: string;
  why_rule_triggered: string;
  evidence_to_review: string[];
  investigation_steps: string[];
  false_positives: string[];
  containment_suggestions: string[];
}

export interface AIAnalysisRecord {
  id: number;
  alert_id: number;
  provider: string;
  model: string;
  content: AIAnalysisContent;
  created_at: string;
}

export interface AnalyzeResponse {
  available: boolean;
  ai_generated: boolean;
  provider: string;
  model: string | null;
  disclaimer: string;
  reason: string | null;
  analysis: AIAnalysisContent | null;
  analysis_id: number | null;
  created_at: string | null;
}

export interface TrustBoundary {
  id: string;
  from_node: string;
  to_node: string;
  title: string;
  description: string;
  failure_modes: string[];
  controls: string[];
  rules: string[];
}

export interface AISecurityOverview {
  nodes: { id: string; label: string; kind: string; description: string }[];
  boundaries: TrustBoundary[];
  topics: { title: string; summary: string; owasp: string; atlas: string[]; labs: string[] }[];
  labs: {
    slug: string;
    title: string;
    difficulty: Difficulty;
    duration_minutes: number;
    summary: string;
    number: number;
  }[];
  finding_count: number;
}

export interface AIFinding {
  alert: AlertSummary;
  boundary_id: string | null;
  boundary_title: string | null;
  what_failed: string;
  control: string;
}

// ── search / docs / settings ───────────────────────────────────────────────────────────────
export interface SearchHit {
  kind: "lab" | "rule" | "technique" | "alert" | "doc" | "learning" | "indicator";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  badge: string | null;
}

export interface DocSummary {
  slug: string;
  title: string;
  path: string;
}

export interface DocPage extends DocSummary {
  markdown: string;
}

export interface RuntimeSettings {
  version: string;
  env: string;
  demo_mode: boolean;
  ai: AIStatus;
  content: { mitre: Record<string, string>; labs: number; rules: number; docs: number };
  counts: Record<string, number>;
  lab_network: Record<string, string>;
}

// ── v0.2: detection tests, quality and the playground ────────────────────────────────────────
export interface QualityCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface RuleQuality {
  slug: string;
  title: string;
  level: string;
  technique_ids: string[];
  passed: number;
  total: number;
  checks: QualityCheck[];
  positive_tests: number;
  negative_tests: number;
  failing_tests: number;
}

export interface DetectionCoverage {
  rules: number;
  tested: number;
  percent: number;
  tests: number;
  failing: number;
}

export interface QualityResponse {
  coverage: DetectionCoverage;
  checks_passed: number;
  checks_total: number;
  rules: RuleQuality[];
}

export interface RuleTestCaseResult {
  name: string;
  expected: boolean;
  passed: boolean;
  message: string;
  matched_events: number[];
  hits: number;
  definition: Record<string, unknown>;
}

export interface RuleTests {
  slug: string;
  tests_path: string | null;
  source: string | null;
  errors: string[];
  cases: RuleTestCaseResult[];
  quality: RuleQuality | null;
}

export interface PlaygroundDataset {
  slug: string;
  name: string;
  description: string;
  source_type: string;
  kind: "events" | "files";
  difficulty: string;
  item_count: number;
  mitre: { id: string; name: string | null }[];
  expected_rules: { slug: string; title: string; format: RuleFormat }[];
  try_this: string[];
}

export interface PlaygroundItem {
  index: number;
  kind: "event" | "file";
  title: string;
  offset_seconds: number;
  timestamp: string | null;
  category: string | null;
  source: string | null;
  host: string | null;
  user: string | null;
  raw: string;
  fields: Record<string, unknown>;
  note: string | null;
  size: number | null;
}

export interface PlaygroundDatasetDetail extends PlaygroundDataset {
  items: PlaygroundItem[];
}

export type Verdict = "matched" | "no_match" | "not_applicable";

export interface PlaygroundRule {
  title: string;
  level: string;
  status: string | null;
  description: string;
  logsource: Record<string, string>;
  techniques: string[];
  falsepositives: string[];
  references: string[];
  is_correlation: boolean;
  fields: string[];
}

export interface CorrelationSummary {
  type: string;
  timespan_seconds: number;
  group_by: string[];
  base_rules: { rule: string; title: string; matching_events: number[] }[];
  hits: {
    event_indexes: number[];
    group: Record<string, unknown> | null;
    details: Record<string, unknown>;
    first: string;
    last: string;
  }[];
}

export interface PlaygroundRun {
  format: RuleFormat;
  valid: boolean;
  errors: string[];
  warnings: string[];
  item_count: number;
  matched_count: number;
  meta?: PlaygroundRule;
  mitre?: { id: string; name: string | null; known: boolean }[];
  results: { index: number; verdict: Verdict; matched_fields: string[] }[];
  correlation: CorrelationSummary | null;
}

export interface TraceValue {
  pattern: string;
  text: string;
  matched: boolean;
}

export interface TraceItem {
  kind: "item";
  field: string | null;
  modifiers: string[];
  operator: string;
  linking: "and" | "or";
  matched: boolean;
  actual: unknown;
  values: TraceValue[];
}

export interface TraceSelection {
  kind: "selection" | "group";
  name: string;
  matched: boolean;
  linking: "and" | "or";
  children: (TraceItem | TraceSelection)[];
}

export interface TraceCondition {
  op: "and" | "or" | "not" | "selection" | "any_of" | "all_of";
  label: string;
  matched: boolean;
  children: TraceCondition[];
}

export interface SigmaExplanation {
  matched: boolean;
  outcome: "matched" | "not_matched" | "logsource_mismatch";
  summary: string;
  logsource: {
    rule: Record<string, string>;
    event: Record<string, string>;
    compatible: boolean;
  };
  selections: TraceSelection[];
  condition: TraceCondition | null;
  condition_text: string;
  hints: string[];
}

export interface YaraExplanation {
  rule: string;
  matched: boolean;
  condition_text: string;
  filesize: number;
  unsupported: string | null;
  strings: {
    name: string;
    kind: "text" | "regex";
    pattern: string;
    modifiers: string[];
    count: number;
    offsets: number[];
    excerpt: string | null;
    matched: boolean;
  }[];
  terms: { label: string; matched: boolean; detail: string }[];
}

export interface SuricataExplanation {
  action: string;
  protocol: string;
  source: string;
  direction: string;
  destination: string;
  msg: string;
  sid: string;
  classtype: string | null;
  metadata: string | null;
  options: { name: string; value: string }[];
  checks: {
    label: string;
    buffer: string;
    kind: "content" | "pcre";
    pattern: string;
    modifiers: string[];
    matched: boolean;
    actual: string | null;
  }[];
  not_evaluated: string[];
  matched: boolean | null;
  summary: string;
}

export interface PlaygroundExplain {
  format: RuleFormat;
  kind: "event" | "file" | "correlation";
  item: PlaygroundItem;
  matched: boolean;
  explanation?: SigmaExplanation | YaraExplanation | SuricataExplanation;
  correlation?: CorrelationSummary;
  member_of?: number[];
  bases?: (SigmaExplanation & { rule: string })[];
}

// ── v0.2: attack stories ─────────────────────────────────────────────────────────────────────
export type StoryDomain = "endpoint" | "identity" | "web" | "network" | "cloud" | "ai-security";

export interface StorySummary {
  slug: string;
  title: string;
  summary: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  duration_minutes: number;
  domain: StoryDomain;
  order: number;
  tags: string[];
  step_count: number;
  event_count: number;
  techniques: string[];
  detection_count: number;
  start: string;
  end: string;
}

export interface StoryEvidence {
  id: string;
  title: string;
  kind: "log" | "process-tree" | "network" | "email" | "ticket" | "note" | "alert";
  content: string;
  significance: "key" | "supporting" | "noise";
  finding: string | null;
}

export interface StoryQuestionOption {
  id: string;
  text: string;
  correct: boolean;
  explanation: string;
}

export interface StoryQuestion {
  id: string;
  prompt: string;
  kind: "single" | "multiple";
  options: StoryQuestionOption[];
  hint: string | null;
}

export interface StoryDecisionOption {
  id: string;
  text: string;
  quality: "best" | "acceptable" | "poor";
  feedback: string;
}

export interface StoryDecision {
  id: string;
  prompt: string;
  context: string | null;
  options: StoryDecisionOption[];
}

export type GraphNodeType =
  | "user"
  | "host"
  | "process"
  | "ip"
  | "domain"
  | "detection"
  | "alert"
  | "technique";

export type GraphRelation =
  | "executed"
  | "connected to"
  | "triggered"
  | "mapped to"
  | "associated with";

export interface StoryGraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  ref: string | null;
}

export interface StoryGraphEdge {
  source: string;
  target: string;
  relation: GraphRelation;
}

export interface StoryEvent {
  index: number;
  timestamp: string;
  source: string;
  category: string;
  host: string | null;
  user: string | null;
  message: string;
  raw: string;
  note: string | null;
  fields: Record<string, unknown>;
}

export interface StoryDetection {
  slug: string;
  title: string;
  level: string;
  format: RuleFormat;
  is_correlation: boolean;
  techniques: string[];
  events: number[];
  declared: boolean;
  why: { summary: string; event: number } | null;
}

export interface StoryStep {
  id: string;
  time: string;
  timestamp: string;
  title: string;
  narrative: string;
  events: StoryEvent[];
  evidence: StoryEvidence[];
  detections: StoryDetection[];
  alert: { title: string; severity: string; rule: string | null } | null;
  techniques: { id: string; name: string | null }[];
  questions: StoryQuestion[];
  decision: StoryDecision | null;
  graph: { nodes: StoryGraphNode[]; edges: StoryGraphEdge[] };
}

export interface StoryContainment {
  id: string;
  action: string;
  category: string;
  quality: "recommended" | "optional" | "harmful";
  effect: string;
  feedback: string;
}

export interface Story extends StorySummary {
  briefing: string;
  attack_chain: {
    tactic: string;
    technique: string;
    technique_name: string | null;
    step: string;
    description: string;
  }[];
  steps: StoryStep[];
  containment: StoryContainment[];
  postmortem: {
    summary: string;
    root_cause: string;
    what_worked: string[];
    what_to_improve: string[];
    detections_to_add: string[];
    lessons: string[];
  };
}
