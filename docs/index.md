---
layout: home

hero:
  name: "firetg"
  text: "Telegram CLI for scripts and agents"
  tagline: "Read, search, and send through MTProto with predictable JSON output."
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Command reference
      link: /commands/

features:
  - title: Agent-ready JSON
    details: Successful results and structured errors are written as JSON for reliable tool use.
    link: /guide/agent-usage
    linkText: Use with agents
  - title: Full message workflow
    details: Read history, search streams, send files, and schedule Telegram-native delivery.
    link: /commands/messages
    linkText: Message commands
  - title: MTProto sessions
    details: Log in with QR or phone and keep credentials and peer state in local SQLite storage.
    link: /guide/authentication
    linkText: Authentication
  - title: Scoped commands
    details: Discover related operations through consistent auth, profiles, channels, messages, dialogs, and folders groups.
    link: /commands/
    linkText: Browse commands
  - title: Flexible peers
    details: Address usernames, known IDs, channels, groups, or Saved Messages with one peer model.
    link: /guide/peers
    linkText: Peer formats
  - title: Script-friendly output
    details: Pipe results directly into jq, Bun, or any runtime that can parse standard JSON.
    link: /reference/output
    linkText: Output reference
---
