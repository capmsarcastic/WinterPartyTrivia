// ============================================================
// Configurable strings
// All player-facing text uses Australian English.
// ============================================================

export const STRINGS = {
  appName: 'Winter Party Trivia',
  appSubtitle: 'Before you ask: yes, Stephen has enough work to do',

  splash: {
    heading: '🐋 Winter Party Trivia',
    subheading: "Easy-peasy 'Ume data lemon'-squeezy",
    cta: "Let's go",
  },

  join: {
    heading: 'Pick your team',
    createButton: '+ Create a new team',
    teamCreationClosed: "Team creation is closed for the night.",
    noTeamsYet: "No teams yet. Make one by clicking below 👇",
    memberCount: (n: number) => n === 1 ? '1 member' : `${n} members`,
  },

  teamCreator: {
    heading: 'Start a new team',
    namePlaceholder: 'Your legendary team name...',
    nameLabel: 'Team name',
    imageLabel: 'Team vibe',
    passcodeLabel: 'Secret passcode (4 digit number)',
    passcodePlaceholder: '••••',
    yourNameLabel: 'Your name',
    yourNamePlaceholder: 'Keep it work-appropriate, please',
    submitButton: 'Submit for approval',
    nameCheckingMessage: 'Checking availability...',
    nameTakenMessage: 'That name is taken. Try something else.',
    nameAvailableMessage: '✓ Name is available!',
  },

  pending: {
    heading: 'Waiting for Stephen to approve the team...',
    subheading: 'Sit tight. Try shouting "HURRY UP STEPHEN"; it might help.',
    cancelButton: 'Cancel',
  },

  rejection: {
    heading: "Oof, Stephen rejected the team, sorry.",
    backButton: 'Back to the join screen',
  },

  lobby: {
    scoreLabel: 'Total score',
    passcodeReveal: 'Tap to reveal passcode',
    membersLabel: 'Team members',
    roundsLabel: 'Rounds',
    messagesLabel: 'Messages',
    scoreHistoryLabel: 'Score history',
    messageAdminButton: 'Message the admin',
    bootConfirm: (name: string) => `Boot ${name} from the team? This will rotate the passcode.`,
    bootButton: 'Boot',
    noRoundsYet: "No rounds yet — have a drink 🍹",
    roundStateLabels: {
      draft: 'Coming up',
      open: '🟢 Open',
      locked: '🔒 Locked',
      marked: '✍️ Being marked',
      revealed: '✅ Results available',
    } as Record<string, string>,
    viewResults: 'View results →',
    soundToggle: 'Sounds',
    leaveTeam: 'Leave team',
    leaveConfirm: 'Leave your team? You can rejoin with the passcode.',
  },

  roundAnswer: {
    heading: (title: string) => title,
    lastEdited: (name: string) => `Last edited by ${name}`,
    lockedBanner: '🔒 Round is locked — no more edits.',
    submitHint: 'Answers save automatically.',
    numericUnit: (unit: string) => unit,
  },

  roundResults: {
    heading: 'Your results',
    correctLabel: 'Correct answer',
    yourAnswerLabel: 'Your answer',
    pointsLabel: 'Points',
    backButton: '← Back to lobby',
    totalLabel: 'Round total',
  },

  messages: {
    placeholder: 'Type your message...',
    sendButton: 'Send',
    broadcastBadge: '📢 Broadcast',
    adminBadge: 'Admin',
  },

  loading: [
    'Consulting the deep...',
    'Asking the whale...',
    'Diving deeper...',
    'Counting bubbles...',
    'Almost there...',
  ],

  errors: {
    generic: 'Something went wrong. Try again.',
    networkError: 'Connection lost. Reconnecting...',
    passcodeWrong: 'Wrong passcode. Try again.',
    nameTaken: 'That name is already taken on this team.',
    teamFull: 'Could not join team.',
  },

  reconnecting: 'Reconnecting...',
  connected: 'Connected',
}

export function randomLoadingMessage(): string {
  const msgs = STRINGS.loading
  return msgs[Math.floor(Math.random() * msgs.length)]
}
