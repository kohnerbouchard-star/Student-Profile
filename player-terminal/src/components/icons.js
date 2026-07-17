const ICONS = Object.freeze({
  dashboard: {
    mode: "stroke",
    content: `<rect x="3.5" y="3.5" width="7" height="7" rx="1.25"/><rect x="13.5" y="3.5" width="7" height="4.5" rx="1.25"/><rect x="13.5" y="10.5" width="7" height="10" rx="1.25"/><rect x="3.5" y="13" width="7" height="7.5" rx="1.25"/>`
  },
  market: {
    mode: "stroke",
    content: `<path d="M4 19.5V14m0-4V4.5M2.5 10h3M9.3 19.5v-4m0-4V4.5M7.8 15.5h3M14.7 19.5v-8m0-3V4.5M13.2 11.5h3M20 19.5v-3m0-4V4.5M18.5 16.5h3"/><path d="M2.5 21h19"/>`
  },
  store: {
    mode: "stroke",
    content: `<path d="M4 9.5v10.75h16V9.5"/><path d="M3 9.5 4.7 4h14.6L21 9.5"/><path d="M3 9.5c0 1.45 1.05 2.5 2.4 2.5S8 10.95 8 9.5c0 1.45 1.05 2.5 2.4 2.5S13 10.95 13 9.5c0 1.45 1.05 2.5 2.4 2.5S18 10.95 18 9.5c0 1.45 1.05 2.5 2.4 2.5.2 0 .4-.02.6-.07"/><path d="M8.5 20.25v-5.5h7v5.5"/>`
  },
  contracts: {
    mode: "stroke",
    content: `<path d="M8 4.25H5.75A1.75 1.75 0 0 0 4 6v14h16V6a1.75 1.75 0 0 0-1.75-1.75H16"/><path d="M9 3h6v4H9z"/><path d="m8 13 2 2 4.5-4.5M8 18h8"/>`
  },
  inventory: {
    mode: "stroke",
    content: `<path d="m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4Z"/><path d="m3.5 7 8.5 4 8.5-4v10L12 21l-8.5-4V7Z"/><path d="M12 11v10M8.2 5.2l8.4 4"/>`
  },
  banking: {
    mode: "stroke",
    content: `<path d="M3 8.5 12 3l9 5.5H3Z"/><path d="M5 10.5v7m4-7v7m6-7v7m4-7v7M3 20.5h18"/><path d="M2.5 8.5h19"/>`
  },
  profile: {
    mode: "stroke",
    content: `<rect x="3.5" y="4" width="17" height="16" rx="2"/><circle cx="9" cy="10" r="2.5"/><path d="M5.8 16c.55-2.05 1.6-3.25 3.2-3.25s2.65 1.2 3.2 3.25M14.5 9h3.25M14.5 12.5h3.25M14.5 16h2"/>`
  },
  news: {
    mode: "stroke",
    content: `<path d="M4 5.5h16v13H4z"/><path d="M7 9h5M7 12h10M7 15h7"/><path d="M15 8h2v2h-2z"/>`
  },
  portfolio: {
    mode: "stroke",
    content: `<path d="M4 7.5h16v11H4z"/><path d="M8 7.5V5h8v2.5M4 11.5h16"/><path d="M9 14.5h6"/>`
  },
  pulse: {
    mode: "stroke",
    content: `<path d="M3 12h4l2-5 4 10 2-5h6"/>`
  },
  star: {
    mode: "stroke",
    content: `<path d="m12 3 2.7 5.45 6.05.88-4.38 4.27 1.03 6.03L12 16.8l-5.4 2.83 1.03-6.03-4.38-4.27 6.05-.88L12 3Z"/>`
  },
  chevronLeft: {
    mode: "stroke",
    content: `<path d="m15 18-6-6 6-6"/>`
  },
  chevronRight: {
    mode: "stroke",
    content: `<path d="m9 18 6-6-6-6"/>`
  },
  bell: {
    mode: "stroke",
    content: `<path d="M18.25 9.25a6.25 6.25 0 0 0-12.5 0c0 6-2.75 6.5-2.75 8.5h18c0-2-2.75-2.5-2.75-8.5Z"/><path d="M9.5 20.25h5"/>`
  },
  refresh: {
    mode: "stroke",
    content: `<path d="M20 6v5h-5"/><path d="M19.2 11a7.5 7.5 0 1 0 .25 5.1"/>`
  },
  chevron: {
    mode: "stroke",
    content: `<path d="m9 18 6-6-6-6"/>`
  },
  wallet: {
    mode: "stroke",
    content: `<path d="M4 6.5h14.25A2.75 2.75 0 0 1 21 9.25v9.25H4V6.5Z"/><path d="M4 6.5 16.5 3.5v3M16.25 11h4.75v4h-4.75a2 2 0 0 1 0-4Z"/><circle cx="17" cy="13" r=".55" fill="currentColor" stroke="none"/>`
  },
  chart: {
    mode: "stroke",
    content: `<path d="M3.5 19.5h17"/><path d="M5 17 9.25 12l3.2 2.8L19.5 6"/><path d="M15.5 6h4v4"/>`
  },
  cart: {
    mode: "stroke",
    content: `<path d="M3 4.5h2.25L7.2 15h10.25l2-7.25H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>`
  },
  send: {
    mode: "stroke",
    content: `<path d="m3 11.25 18-8-8 18-2.2-7.8L3 11.25Z"/><path d="m10.8 13.45 10.2-10.2"/>`
  },
  upload: {
    mode: "stroke",
    content: `<path d="M12 15.5V3.5m0 0-4.25 4.25M12 3.5l4.25 4.25"/><path d="M4 14.5v5.75h16V14.5"/>`
  },
  use: {
    mode: "stroke",
    content: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M7.5 12h9"/>`
  },
  close: {
    mode: "stroke",
    content: `<path d="m5.5 5.5 13 13M18.5 5.5l-13 13"/>`
  },
  menu: {
    mode: "stroke",
    content: `<path d="M4 6.5h16M4 12h16M4 17.5h16"/>`
  },
  globe: {
    mode: "stroke",
    content: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.7 2.35 4.1 5.35 4.1 9S14.7 18.65 12 21M12 3C9.3 5.35 7.9 8.35 7.9 12S9.3 18.65 12 21"/>`
  },
  eye: {
    mode: "stroke",
    content: `<path d="M2.5 12s3.65-5.75 9.5-5.75S21.5 12 21.5 12 17.85 17.75 12 17.75 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.5"/>`
  },
  check: {
    mode: "stroke",
    content: `<path d="m5 12 4 4L19 6"/>`
  },
  clock: {
    mode: "stroke",
    content: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.25 2"/>`
  },
  arrowSwap: {
    mode: "stroke",
    content: `<path d="M4 7h14l-3-3m3 3-3 3M20 17H6l3 3m-3-3 3-3"/>`
  },
  business: {
    mode: "stroke",
    content: `<path d="M4 20V8l5 3V8l5 3V4h6v16H4Z"/><path d="M7 16h2m3 0h2m3-7h1m-1 4h1m-1 4h1"/>`
  },
  marketplace: {
    mode: "stroke",
    content: `<path d="M4 9.5v10h16v-10"/><path d="M3 9.5 5 4h14l2 5.5"/><path d="M3 9.5c0 1.4 1 2.5 2.4 2.5S8 10.9 8 9.5c0 1.4 1 2.5 2.4 2.5S13 10.9 13 9.5c0 1.4 1 2.5 2.4 2.5S18 10.9 18 9.5c0 1.4 1 2.5 2.4 2.5"/><path d="M9 20v-5h6v5"/>`
  },
  crafting: {
    mode: "stroke",
    content: `<path d="M4 19h16M6 19v-7l6-4 6 4v7"/><path d="M9 19v-4h6v4M14.5 5.5l1-2 1 2 2 .8-2 1-.8 2-1-2-2-.8 2-.9Z"/>`
  },
  loans: {
    mode: "stroke",
    content: `<path d="M3 9 12 4l9 5H3Z"/><path d="M5 11v7m4-7v7m6-7v7m4-7v7M3 20h18"/><path d="M9.5 14h5M12 11.8v4.4"/>`
  },
  messages: {
    mode: "stroke",
    content: `<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/>`
  },
  progression: {
    mode: "stroke",
    content: `<path d="M12 3 9.8 7.4 5 8.1l3.5 3.4-.8 4.8 4.3-2.3 4.3 2.3-.8-4.8L19 8.1l-4.8-.7L12 3Z"/><path d="M8 17.5 6.5 21 12 19l5.5 2-1.5-3.5"/>`
  },
  factory: {
    mode: "stroke",
    content: `<path d="M3 20V10l6 3V9l6 3V4h6v16H3Z"/><path d="M6 17h2m3 0h2m4-9h2m-2 4h2m-2 4h2"/>`
  },
  users: {
    mode: "stroke",
    content: `<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-4 2.4-6 5.5-6s5 2 5.5 6"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 14c2.8-.1 4.5 1.6 5 5"/>`
  },
  edit: {
    mode: "stroke",
    content: `<path d="m4 16.5-.5 4 4-.5L19 8.5 15.5 5 4 16.5Z"/><path d="m13.5 7 3.5 3.5"/>`
  },
  tag: {
    mode: "stroke",
    content: `<path d="M3.5 11V4.5H10L20.5 15 15 20.5 4.5 10Z"/><circle cx="7.5" cy="8" r="1.2"/>`
  },
  search: {
    mode: "stroke",
    content: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>`
  },
  paperclip: {
    mode: "stroke",
    content: `<path d="m8.5 12.5 6.7-6.7a3.2 3.2 0 0 1 4.5 4.5L10 20a5 5 0 0 1-7-7l9-9"/><path d="m7 15 8.5-8.5"/>`
  },
  document: {
    mode: "stroke",
    content: `<path d="M6 3.5h8l4 4V20.5H6V3.5Z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/>`
  },
  trophy: {
    mode: "stroke",
    content: `<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 13v4m-4 3h8m-6-3h4"/>`
  },
  lock: {
    mode: "stroke",
    content: `<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/>`
  },
  logout: {
    mode: "stroke",
    content: `<path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/>`
  }
});

export function icon(name, className = "") {
  const definition = ICONS[name] || ICONS.dashboard;
  const classes = ["player-terminal-icon", `player-terminal-icon--${definition.mode}`, className].filter(Boolean).join(" ");
  return `<svg class="${classes}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${definition.content}</svg>`;
}
