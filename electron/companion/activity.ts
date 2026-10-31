export type ActivityCategory = 'coding' | 'debugging' | 'research' | 'browsing' | 'writing' | 'studying' | 'video_media' | 'communication' | 'design' | 'idle_unknown';

export interface ActivityObservation {
  process: string;
  title: string;
  text: string;
}

export interface ActivityClassification {
  category: ActivityCategory;
  confidence: number;
  evidence: string[];
  sensitive: boolean;
  privateWindow: boolean;
}

export interface AssistanceSuggestion {
  id: string;
  category: ActivityCategory;
  message: string;
  reason: string;
  confidence: number;
  createdAt: number;
}

const RULES: Array<{ category: ActivityCategory; process: RegExp; content: RegExp; message: string; reason: string }> = [
  { category: 'debugging', process: /code|visual studio|rider|idea|pycharm|terminal|powershell|cmd|antigravity/i, content: /\b(error|exception|traceback|failed|undefined reference|syntax error|stack trace|build failed|typeerror|referenceerror)\b/i, message: 'I noticed a possible error. Would you like help debugging it?', reason: 'A development app and error-like text were detected.' },
  { category: 'coding', process: /code|visual studio|rider|idea|pycharm|antigravity|notepad\+\+/i, content: /\b(function|class|import|const|return|def |public static|typescript|python|javascript)\b/i, message: 'It looks like you may be coding. Would you like help with this task?', reason: 'A development app and code-like text were detected.' },
  { category: 'studying', process: /acrobat|foxit|sumatra|kindle/i, content: /\b(chapter|lecture|exercise|definition|figure|references|study guide)\b/i, message: 'Would you like me to explain a topic or make short notes?', reason: 'A document reader and study-related text were detected.' },
  { category: 'research', process: /chrome|msedge|firefox|brave|opera/i, content: /\b(research|paper|journal|abstract|references|study|doi)\b/i, message: 'Would you like me to collect useful information from your research?', reason: 'Research-related terms were detected in a browser window.' },
  { category: 'writing', process: /winword|word|writer|notepad|wordpad/i, content: /\b(document|paragraph|draft|heading|review|word count)\b/i, message: 'Would you like me to review or organize your writing?', reason: 'A writing application was detected.' },
  { category: 'design', process: /figma|photoshop|illustrator|blender|canva|krita/i, content: /\b(layer|canvas|frame|design|artboard|shape)\b/i, message: 'Would you like help planning or reviewing this design?', reason: 'A design application was detected.' },
  { category: 'communication', process: /teams|zoom|slack|discord|outlook|whatsapp/i, content: /\b(message|chat|meeting|call|attendees)\b/i, message: 'I’ll stay quiet while you communicate. Open MINDORA if you want help.', reason: 'A communication application is active.' },
  { category: 'video_media', process: /vlc|movies|spotify|netflix|youtube/i, content: /\b(playing|pause|volume|subtitle|episode)\b/i, message: 'Would you like help finding or summarizing information about this media?', reason: 'Media-related application or controls were detected.' },
  { category: 'browsing', process: /chrome|msedge|firefox|brave|opera/i, content: /./, message: 'Would you like me to summarize the page you’re reading?', reason: 'A browser window is active.' }
];

const SENSITIVE_UI = /\b(password|passcode|one[- ]time code|verification code|security code|credit card|card number|social security|bank account|recovery phrase|private key)\b/i;
const PRIVATE_TITLE = /\b(incognito|inprivate|private browsing|private window|guest profile)\b/i;

export function classifyActivity(observation: ActivityObservation): ActivityClassification {
  const process = observation.process.slice(0, 120);
  const title = observation.title.slice(0, 240);
  const text = observation.text.slice(0, 4000);
  const privateWindow = PRIVATE_TITLE.test(title);
  const sensitive = SENSITIVE_UI.test(`${title}\n${text}`);
  if (privateWindow || sensitive) return { category: 'idle_unknown', confidence: 0, evidence: [privateWindow ? 'Private browsing indicator detected.' : 'Sensitive-field indicator detected.'], sensitive, privateWindow };

  for (const rule of RULES) {
    if (!rule.process.test(process)) continue;
    if (rule.content.source !== '.' && !rule.content.test(text)) continue;
    const hasTextSignal = rule.content.source === '.' || rule.content.test(text);
    const confidence = hasTextSignal ? 0.84 : 0.66;
    return { category: rule.category, confidence, evidence: [rule.reason], sensitive: false, privateWindow: false };
  }
  return { category: 'idle_unknown', confidence: 0.2, evidence: ['No strong application or text signal.'], sensitive: false, privateWindow: false };
}

export function suggestionForActivity(classification: ActivityClassification, now = Date.now()): AssistanceSuggestion | null {
  if (classification.sensitive || classification.privateWindow || classification.confidence < 0.65) return null;
  if (classification.category === 'communication' || classification.category === 'video_media' || classification.category === 'idle_unknown') return null;
  return {
    id: `${classification.category}:${Math.floor(now / 60_000)}`,
    category: classification.category,
    message: RULES.find((rule) => rule.category === classification.category)?.message || 'Would you like a hand with this?',
    reason: classification.evidence[0] || 'The active application may benefit from assistance.',
    confidence: classification.confidence,
    createdAt: now
  };
}

export class SuggestionCooldown {
  private dismissedUntil = new Map<ActivityCategory, number>();
  constructor(private readonly cooldownMs = 30 * 60_000) {}
  offer(suggestion: AssistanceSuggestion, now = Date.now()): boolean {
    return (this.dismissedUntil.get(suggestion.category) || 0) <= now;
  }
  dismiss(suggestion: AssistanceSuggestion, now = Date.now()): void {
    this.dismissedUntil.set(suggestion.category, now + this.cooldownMs);
  }
  clearExpired(now = Date.now()): void {
    for (const [category, until] of this.dismissedUntil) if (until <= now) this.dismissedUntil.delete(category);
  }
}

export function matchesExcludedApplication(process: string, excluded: string[]): boolean {
  const normalized = process.trim().toLowerCase();
  return excluded.some((entry) => entry.trim().length > 0 && normalized.includes(entry.trim().toLowerCase()));
}

export function isWithinQuietHours(now: Date, start: string, end: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const from = toMinutes(start); const until = toMinutes(end);
  return from < until ? current >= from && current < until : current >= from || current < until;
}
