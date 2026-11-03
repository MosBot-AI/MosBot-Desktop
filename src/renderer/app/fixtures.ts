import type {
  Artifact,
  BotProfile,
  BotSection,
  ChatMessage,
  ComputerState,
  ConnectionInfo,
  RoutineTask,
} from '../../shared/domain';

/**
 * Deterministic, desensitised design-slice data (M0a). It replays the states in
 * the reference recording so the window can be reviewed without a Dashboard:
 * two sections, six pinned slots, a very long Chinese name, an empty chat, a
 * long reply, an offline Bot, a pending approval and a sleeping computer.
 *
 * Fixtures are for interface review and unit tests only. They never replace a
 * real Dashboard run; M1 switches the same components to real responses.
 */

/** Fixed clock so screenshots and tests do not drift: 2026-11-03 14:00 +08:00. */
export const FIXTURE_EPOCH = Date.UTC(2026, 10, 3, 6, 0, 0);

const minutes = (count: number): number => count * 60_000;

export interface FixtureSeed {
  readonly sections: readonly BotSection[];
  readonly bots: readonly BotProfile[];
  readonly messages: Readonly<Record<string, readonly ChatMessage[]>>;
  readonly artifacts: readonly Artifact[];
  readonly routines: readonly RoutineTask[];
  readonly computers: Readonly<Record<string, ComputerState>>;
  readonly connection: ConnectionInfo;
  readonly selectedBotId: string;
  readonly drafts: Readonly<Record<string, string>>;
}

const LONG_REPLY = [
  '今天评审的共识我整理好了，分三部分。',
  '',
  '一、已确认的范围',
  '- 桌面端首版只连接一个 Dashboard，多连接放到后续版本。',
  '- 聊天顶部只保留名牌，详情按需从右侧打开。',
  '',
  '二、需要跟进的事项',
  '1. 登录回调地址由后端补充到部署配置。',
  '2. 图片上传的尺寸上限需要和设计确认。',
  '',
  '三、给团队的摘要',
  '```',
  '本周评审通过 3 项，待确认 2 项。',
  '下一步：补齐回调配置后联调登录链路。',
  '```',
  '',
  '如果你需要，我可以把这份摘要整理成文件放进资料库。',
].join('\n');

const products = 'sec-product';
const daily = 'sec-daily';

export function createFixtureSeed(): FixtureSeed {
  const selectedBotId = 'bot-project';

  const sections: BotSection[] = [
    { id: products, name: '产品', collapsed: false, order: 0 },
    { id: daily, name: '日常', collapsed: true, order: 1 },
  ];

  const shared = { useMosbotDefault: false } as const;

  const bots: BotProfile[] = [
    {
      id: selectedBotId,
      name: '项目助理与资料整理专员（华东区第二组）',
      shape: 'mosbot',
      color: 'hsl(82 62% 68%)',
      useMosbotDefault: true,
      sectionId: products,
      pinnedIndex: 0,
      presence: 'working',
      unread: 2,
      summary: '正在整理本周的评审记录',
      description: '负责项目资料整理、会议纪要和评审跟进。需要确认时会先问过你。',
      lastActiveMinutes: 12,
    },
    {
      id: 'bot-design',
      name: '设计评审',
      shape: 'squircle',
      color: 'hsl(210 68% 58%)',
      ...shared,
      sectionId: products,
      pinnedIndex: 1,
      presence: 'needs-confirmation',
      unread: 0,
      summary: '有一处配色调整需要你确认',
      description: '汇总设计稿，跟进评审意见和改动。',
      lastActiveMinutes: 3,
    },
    {
      id: 'bot-archive',
      name: '资料整理',
      shape: 'cloud',
      color: 'hsl(152 62% 56%)',
      ...shared,
      sectionId: daily,
      pinnedIndex: 2,
      presence: 'offline',
      unread: 0,
      summary: '上次同步在昨天 18:40',
      description: '归档文档、截图和会议材料。',
      lastActiveMinutes: 640,
    },
    {
      id: 'bot-ops',
      name: '运行看板',
      shape: 'hexagon',
      color: 'hsl(28 68% 58%)',
      ...shared,
      sectionId: daily,
      pinnedIndex: 3,
      presence: 'idle',
      unread: 0,
      summary: '例行任务都正常',
      description: '监控每日任务和运行状态。',
      lastActiveMinutes: 45,
    },
    {
      id: 'bot-mosbot',
      name: 'MosBot',
      shape: 'mosbot',
      color: 'hsl(82 62% 68%)',
      useMosbotDefault: true,
      sectionId: null,
      pinnedIndex: 4,
      presence: 'idle',
      unread: 0,
      summary: '连接 Dashboard 后开始工作',
      description: 'MosBot 的默认 Bot，负责引导和日常问答。',
      lastActiveMinutes: 100,
    },
    {
      id: 'bot-weekly',
      name: '周报助手',
      shape: 'pill',
      color: 'hsl(280 68% 58%)',
      ...shared,
      sectionId: products,
      pinnedIndex: 5,
      presence: 'working',
      unread: 1,
      summary: '正在汇总 5 份周报',
      description: '汇总每个人的周报，生成团队周报草稿。',
      lastActiveMinutes: 1,
    },
    {
      id: 'bot-voice',
      name: '语音转写员',
      shape: 'drop',
      color: 'hsl(188 62% 54%)',
      ...shared,
      sectionId: daily,
      pinnedIndex: null,
      presence: 'idle',
      unread: 0,
      summary: '等待录音',
      description: '把录音转成文字，先放进草稿等你确认。',
      lastActiveMinutes: 2880,
    },
    {
      id: 'bot-guide',
      name: '新人引导',
      shape: 'triangle',
      color: 'hsl(338 68% 58%)',
      ...shared,
      sectionId: daily,
      pinnedIndex: null,
      presence: 'idle',
      unread: 0,
      summary: '需要我介绍一下工作台吗？',
      description: '介绍 MosBot 的入口、分区和常用操作。',
      lastActiveMinutes: 120,
    },
  ];

  const projectMessages: ChatMessage[] = [
    {
      id: 'msg-p-1',
      role: 'user',
      kind: 'text',
      text: '帮我把今天的评审记录整理成能发给团队的版本，顺便把待办标出来。',
      at: FIXTURE_EPOCH - minutes(42),
    },
    {
      id: 'msg-p-2',
      role: 'bot',
      kind: 'work',
      title: '读取评审记录并归类',
      steps: [
        { id: 'step-1', label: '读取评审记录', detail: '4 份记录，共 18 条结论' },
        { id: 'step-2', label: '合并重复的待办', detail: '18 条合并为 5 条' },
        { id: 'step-3', label: '生成可分享的摘要', detail: '保留结论与负责人' },
      ],
      at: FIXTURE_EPOCH - minutes(41),
    },
    {
      id: 'msg-p-3',
      role: 'bot',
      kind: 'text',
      text: LONG_REPLY,
      at: FIXTURE_EPOCH - minutes(40),
    },
    {
      id: 'msg-p-4',
      role: 'user',
      kind: 'text',
      text: '好，先留着，我下午再确认。',
      at: FIXTURE_EPOCH - minutes(18),
    },
    {
      id: 'msg-p-5',
      role: 'bot',
      kind: 'approval',
      at: FIXTURE_EPOCH - minutes(16),
      approval: {
        id: 'approval-save-summary',
        title: '把摘要保存到资料库',
        detail:
          '这个 Bot 想在你的资料库中新增 1 个文件：评审纪要-2026-11-03.md（约 8 KB）。保存后可以在「资料库」里预览和另存。',
        actions: [
          { id: 'allow', tone: 'primary' },
          { id: 'deny', tone: 'neutral' },
        ],
        resolution: null,
      },
    },
  ];

  const designMessages: ChatMessage[] = [
    {
      id: 'msg-d-1',
      role: 'user',
      kind: 'text',
      text: '配色方向按 B 方案改，主色再亮一点。',
      at: FIXTURE_EPOCH - minutes(30),
    },
    {
      id: 'msg-d-2',
      role: 'bot',
      kind: 'text',
      text: '收到。我把主色调亮一档，并在下一版里补上对比度检查。',
      at: FIXTURE_EPOCH - minutes(29),
    },
    {
      id: 'msg-d-3',
      role: 'bot',
      kind: 'approval',
      at: FIXTURE_EPOCH - minutes(4),
      approval: {
        id: 'approval-update-tokens',
        title: '更新设计稿里的颜色变量',
        detail: '需要修改 2 个文件的颜色变量：tokens.json 和 hero.png。改动前会保留原图。',
        actions: [
          { id: 'allow', tone: 'primary' },
          { id: 'allow-always', tone: 'neutral' },
          { id: 'deny', tone: 'neutral' },
        ],
        resolution: null,
      },
    },
  ];

  const archiveMessages: ChatMessage[] = [
    {
      id: 'msg-a-1',
      role: 'user',
      kind: 'text',
      text: '把这周的会议材料都归档一下。',
      at: FIXTURE_EPOCH - minutes(700),
    },
    {
      id: 'msg-a-2',
      role: 'bot',
      kind: 'clarify',
      at: FIXTURE_EPOCH - minutes(699),
      clarify: {
        id: 'clarify-scope',
        question: '要按项目归档，还是按日期归档？',
        options: [
          { id: 'by-project', label: '按项目' },
          { id: 'by-date', label: '按日期' },
        ],
        answerId: null,
      },
    },
  ];

  const messages: Record<string, readonly ChatMessage[]> = {
    [selectedBotId]: projectMessages,
    'bot-design': designMessages,
    'bot-archive': archiveMessages,
    'bot-ops': [],
    'bot-mosbot': [],
    'bot-weekly': [],
    'bot-voice': [],
    'bot-guide': [],
  };

  const artifacts: Artifact[] = [
    {
      id: 'art-review-notes',
      profileId: selectedBotId,
      name: '评审纪要-2026-11-03.md',
      kind: 'text',
      sizeLabel: '8 KB',
      sourceMessageId: 'msg-p-3',
      createdMinutesAgo: 16,
      state: 'ready',
    },
    {
      id: 'art-dashboard-shot',
      profileId: selectedBotId,
      name: 'dashboard-connection.png',
      kind: 'image',
      sizeLabel: '412 KB',
      sourceMessageId: 'msg-p-2',
      createdMinutesAgo: 41,
      state: 'ready',
    },
    {
      id: 'art-last-export',
      profileId: selectedBotId,
      name: 'export-2026-10-30.zip',
      kind: 'binary',
      sizeLabel: '2.4 MB',
      sourceMessageId: 'msg-p-1',
      createdMinutesAgo: 2880,
      state: 'expired',
    },
    {
      id: 'art-design-hero',
      profileId: 'bot-design',
      name: 'hero-b-v2.png',
      kind: 'image',
      sizeLabel: '1.1 MB',
      sourceMessageId: 'msg-d-2',
      createdMinutesAgo: 29,
      state: 'ready',
    },
  ];

  const routines: RoutineTask[] = [
    {
      id: 'routine-nightly',
      title: '每天 09:30 汇总夜间消息',
      scheduleLabel: '每天 09:30',
      enabled: true,
    },
    {
      id: 'routine-weekly',
      title: '每周五 17:00 生成周报草稿',
      scheduleLabel: '每周五 17:00',
      enabled: true,
    },
    {
      id: 'routine-cleanup',
      title: '每两周清理一次旧截图',
      scheduleLabel: '每两周',
      enabled: false,
    },
  ];

  const computers: Record<string, ComputerState> = {
    [selectedBotId]: { profileId: selectedBotId, status: 'asleep', frameAgeSeconds: 0 },
    'bot-design': { profileId: 'bot-design', status: 'other-viewer', frameAgeSeconds: 0 },
    'bot-ops': { profileId: 'bot-ops', status: 'preview', frameAgeSeconds: 2 },
    'bot-weekly': { profileId: 'bot-weekly', status: 'watching', frameAgeSeconds: 1 },
    'bot-archive': { profileId: 'bot-archive', status: 'asleep', frameAgeSeconds: 0 },
    'bot-mosbot': { profileId: 'bot-mosbot', status: 'asleep', frameAgeSeconds: 0 },
    'bot-voice': { profileId: 'bot-voice', status: 'asleep', frameAgeSeconds: 0 },
    'bot-guide': { profileId: 'bot-guide', status: 'asleep', frameAgeSeconds: 0 },
  };

  const connection: ConnectionInfo = {
    status: 'offline',
    accountLabel: '设计样例 · 未连接',
    dashboardLabel: '设计样例',
    versionLabel: '0.1.0',
  };

  const drafts: Record<string, string> = {
    'bot-design': '配色按 B 方案，主色再亮一点，',
  };

  return {
    sections,
    bots,
    messages,
    artifacts,
    routines,
    computers,
    connection,
    selectedBotId,
    drafts,
  };
}
