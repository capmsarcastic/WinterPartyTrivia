// ============================================================
// Configurable strings — edit here to inject your personality
// All player-facing text uses Australian English.
// ============================================================

export const STRINGS = {
  appName: 'Winter Party Trivia',

  splash: {
    heading: '🐋 Winter Party Trivia',
    subheading: "Easy peasey 'Ume data' squeezy",
    cta: "Let's go!",
  },

  playerName: {
    label: 'Your name',
    placeholder: "Keep this work appropriate, please",
    checking: 'Checking availability...',
    taken: 'That name is already taken.',
    available: '✓ Name available!',
    changeLink: 'change name',
  },

  join: {
    heading: 'Pick your team',
    createButton: '+ Create a new team',
    teamCreationClosed: "Team creation is closed for the night.",
    noTeamsYet: "No teams yet. Create one below 👇",
    memberCount: (n: number) => n === 1 ? '1 member' : `${n} members`,
    joinButton: 'Join team',
    joiningButton: 'Joining...',
    missingNameWarning: 'Go back to the start to set your name first.',
    loading: 'Loading...',
  },

  teamCreator: {
    heading: 'Start a new team',
    namePlaceholder: 'Extra points for funny team names',
    nameLabel: 'Team name',
    imageLabel: 'Team vibe',
    passcodeLabel: 'Secret passcode (4 digit number)',
    submitButton: 'Submit for approval',
    nameCheckingMessage: 'Checking availability...',
    nameTakenMessage: 'That name is taken. Try something else.',
    nameAvailableMessage: '✓ Name is available!',
  },

  pending: {
    heading: 'Waiting for Stephen to approve...',
    subheading: "ℹ️ Tip: shouting HURRY UP may make this part go faster.",
    cancelButton: 'Cancel',
    joiningMessage: 'Joining your team...',
    waitMessage: "You'll be taken straight in.",
    approvedMessage: 'Your team was approved! Join now.',
  },

  rejection: {
    heading: "REJECTED (sorry)",
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
    leaveTeam: 'Leave team',
    leaveConfirm: 'Leave your team? You can rejoin with the passcode.',
    passcodeError: 'Could not fetch passcode.',
    messageSent: 'Message sent!',
    passcodeLoading: 'Loading...',
    bootedMessage: (name: string, code: string) => `${name} has been removed. New passcode: ${code}`,
  },

  roundAnswer: {
    heading: (title: string) => title,
    lastEdited: (name: string) => `Last edited by ${name}`,
    lockedBanner: '🔒 Round is locked — no more edits.',
    submitHint: 'Answers save automatically.',
    loading: 'Loading...',
  },

  roundResults: {
    heading: 'Your results',
    yourAnswerLabel: 'Your answer',
    backButton: '← Back to lobby',
    totalLabel: 'Round total',
    loading: 'Loading...',
  },

  messages: {
    placeholder: 'Type your message...',
    sendButton: 'Send',
    broadcastBadge: '📢 Broadcast',
    adminBadge: 'Admin',
  },

  loading: [
    'Waving at Tyson...',
    'Checking if Avalon is free...',
    'Forgetting to book a desk...',
    'Picking pineapple off pizza...',
    'Almost there...',
  ],

  errors: {
    generic: 'Something went wrong. Try again.',
    networkError: 'Connection lost. Reconnecting...',
    passcodeWrong: 'Wrong passcode. Try again.',
    nameTaken: 'That name is already taken on this team.',
  },

  reconnecting: 'Reconnecting...',

  admin: {
    loading: 'Loading...',
  },
}

export function randomLoadingMessage(): string {
  return STRINGS.loading[Math.floor(Math.random() * STRINGS.loading.length)]
}
