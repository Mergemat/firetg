import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

export default defineConfig({
  lang: "en-US",
  title: "firetg",
  titleTemplate: ":title | firetg",
  description: "Agent-ready Telegram MTProto CLI powered by mtcute.",
  cleanUrls: true,
  srcExclude: ["agents/**"],
  lastUpdated: true,
  sitemap: {
    hostname: "https://firetg-docs.vercel.app",
  },
  head: [
    ["meta", { name: "theme-color", content: "#11100f" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "firetg documentation" }],
    [
      "meta",
      {
        property: "og:description",
        content: "Telegram from the command line, with stable JSON for scripts and agents.",
      },
    ],
  ],
  markdown: {
    lineNumbers: true,
    codeCopyButtonTitle: "Copy command",
  },
  vite: {
    plugins: [
      llmstxt({
        ignoreFiles: ["agents/**"],
        excludeIndexPage: true,
        customTemplateVariables: {
          title: "firetg",
          description:
            "Agent-ready Telegram MTProto CLI with predictable JSON output.",
          details:
            "Use these docs to authenticate, resolve Telegram peers, read and search messages, send text or files, and handle errors safely.",
        },
      }),
    ],
  },
  themeConfig: {
    siteTitle: "firetg",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Commands", link: "/commands/" },
      { text: "Reference", link: "/reference/output" },
      { text: "Changelog", link: "https://github.com/Mergemat/firetg/releases" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Start here",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Authentication", link: "/guide/authentication" },
            { text: "Peers and IDs", link: "/guide/peers" },
            { text: "Use with agents", link: "/guide/agent-usage" },
          ],
        },
      ],
      "/commands/": [
        {
          text: "Command reference",
          items: [
            { text: "Overview", link: "/commands/" },
            { text: "status and doctor", link: "/commands/diagnostics" },
            { text: "auth", link: "/commands/auth" },
            { text: "profiles", link: "/commands/profiles" },
            { text: "channels", link: "/commands/channels" },
            { text: "messages", link: "/commands/messages" },
            { text: "dialogs and folders", link: "/commands/dialogs-folders" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "JSON output", link: "/reference/output" },
            { text: "Configuration", link: "/reference/configuration" },
            { text: "Errors and exit codes", link: "/reference/errors" },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/Mergemat/firetg" },
      { icon: "npm", link: "https://www.npmjs.com/package/firetg" },
    ],
    search: {
      provider: "local",
      options: {
        detailedView: true,
        translations: {
          button: {
            buttonText: "Search docs",
            buttonAriaLabel: "Search documentation",
          },
        },
      },
    },
    outline: { level: [2, 3], label: "On this page" },
    editLink: {
      pattern: "https://github.com/Mergemat/firetg/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Built for scripts, agents, and humans who prefer JSON.",
      copyright: "Released under the MIT License.",
    },
    docFooter: {
      prev: "Previous",
      next: "Next",
    },
    returnToTopLabel: "Back to top",
    sidebarMenuLabel: "Menu",
    darkModeSwitchLabel: "Theme",
  },
});
