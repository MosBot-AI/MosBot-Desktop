/** Body shapes the MosBot face can wear; mirrors the mobile BotFace checklist. */
export const BOT_SHAPES = [
  'mosbot',
  'circle',
  'squircle',
  'pill',
  'triangle',
  'hexagon',
  'cloud',
  'drop',
  'blobatar',
] as const;

export type BotShape = (typeof BOT_SHAPES)[number];

/** The five states a Bot can show in the roster (technical states stay hidden). */
export const PRESENCES = ['idle', 'working', 'replying', 'needs-confirmation', 'offline'] as const;

export type Presence = (typeof PRESENCES)[number];

export interface BotSection {
  readonly id: string;
  readonly name: string;
  readonly collapsed: boolean;
  readonly order: number;
}

export interface BotProfile {
  readonly id: string;
  readonly name: string;
  /** Display name may be a long, mixed-script string; `slug` stays internal. */
  readonly shape: BotShape;
  readonly color: string;
  /** True for the MosBot default look: the brand body colour ignores `color`. */
  readonly useMosbotDefault: boolean;
  readonly sectionId: string | null;
  /** 0-based slot in the pinned grid, `null` when unpinned. */
  readonly pinnedIndex: number | null;
  readonly presence: Presence;
  readonly unread: number;
  readonly summary: string;
  readonly description: string;
  /** Minutes since the Bot last did something; the UI formats it. */
  readonly lastActiveMinutes: number;
}

export type ChatRole = 'user' | 'bot';

export interface WorkStep {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

export type ApprovalActionId = 'allow' | 'allow-session' | 'allow-always' | 'deny';

export interface ApprovalAction {
  readonly id: ApprovalActionId;
  readonly tone: 'primary' | 'neutral' | 'danger';
}

export interface ApprovalResolution {
  readonly action: ApprovalActionId;
  readonly at: number;
}

export interface ApprovalRequest {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly actions: readonly ApprovalAction[];
  readonly resolution: ApprovalResolution | null;
}

export interface ClarifyOption {
  readonly id: string;
  readonly label: string;
}

export interface ClarifyRequest {
  readonly id: string;
  readonly question: string;
  readonly options: readonly ClarifyOption[];
  readonly answerId: string | null;
}

export interface TextMessage {
  readonly id: string;
  readonly role: ChatRole;
  readonly kind: 'text';
  readonly text: string;
  readonly at: number;
}

export interface WorkRecordMessage {
  readonly id: string;
  readonly role: 'bot';
  readonly kind: 'work';
  readonly title: string;
  readonly steps: readonly WorkStep[];
  readonly at: number;
}

export interface ApprovalMessage {
  readonly id: string;
  readonly role: 'bot';
  readonly kind: 'approval';
  readonly approval: ApprovalRequest;
  readonly at: number;
}

export interface ClarifyMessage {
  readonly id: string;
  readonly role: 'bot';
  readonly kind: 'clarify';
  readonly clarify: ClarifyRequest;
  readonly at: number;
}

export interface StoppedMessage {
  readonly id: string;
  readonly role: 'bot';
  readonly kind: 'stopped';
  readonly text: string;
  readonly at: number;
}

export type ChatMessage =
  TextMessage | WorkRecordMessage | ApprovalMessage | ClarifyMessage | StoppedMessage;

export type ComputerStatus =
  | 'asleep'
  | 'waking'
  | 'preview'
  | 'watching'
  | 'controlling'
  | 'other-viewer'
  | 'reconnecting'
  | 'failed';

export interface ComputerState {
  readonly profileId: string;
  readonly status: ComputerStatus;
  /** Seconds since the frame in `preview`, for the status line. */
  readonly frameAgeSeconds: number;
}

export type ArtifactKind = 'image' | 'text' | 'binary' | 'link';
export type ArtifactState = 'ready' | 'expired' | 'denied' | 'deleted';

export interface Artifact {
  readonly id: string;
  readonly profileId: string;
  readonly name: string;
  readonly kind: ArtifactKind;
  readonly sizeLabel: string;
  readonly sourceMessageId: string;
  readonly createdMinutesAgo: number;
  readonly state: ArtifactState;
}

export interface RoutineTask {
  readonly id: string;
  readonly title: string;
  readonly scheduleLabel: string;
  readonly enabled: boolean;
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export interface ConnectionInfo {
  readonly status: ConnectionStatus;
  readonly accountLabel: string;
  readonly dashboardLabel: string;
  readonly versionLabel: string;
}

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export type Language = 'zh-Hans' | 'en';

export type InspectorTab = 'details' | 'library' | 'computer';
