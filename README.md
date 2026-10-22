[English](README.md) | [简体中文](README.zh-CN.md)
# Codex Reader for Zotero

**Chat with Codex directly inside Zotero's PDF reader.**

Codex Reader integrates your locally installed Codex CLI into Zotero's PDF reader sidebar, allowing you to read, summarize, translate, and discuss academic papers without leaving Zotero.

It reuses your existing Codex authentication, models, configuration, and services.

**No separate API key. No additional HTTP server. No npm runtime dependencies.**

## Installation

1. Make sure Codex CLI is installed, authenticated, and working in your terminal.
2. In Zotero, open **Tools → Plugins / Add-ons**.
3. Click the gear icon and select **Install Plugin From File**.
4. Select `dist/zotero-codex-reader-0.3.0.xpi`.
5. Open a PDF in Zotero and click the green code icon. Codex fills the right content pane.
6. Open **Settings (⋯)** and click **Connect to Codex**. The plugin automatically attempts to locate Codex installed through npm.

### Compatibility

Integration has been tested locally with:

- **Zotero:** 10.0.6 (Windows x64)
- **Codex CLI:** 0.163.0

The plugin uses sidebar APIs introduced in Zotero 7. Other Zotero versions and operating systems have not yet been tested.

### Updates

There is currently no automatic update server. To update the plugin, rebuild it and manually install the new XPI package.

The tested Zotero version requires an HTTPS `update_url`, so the plugin uses the following loopback placeholder:

`https://127.0.0.1:9/codex-reader-no-updates.json`

Automatic background updates are disabled for this plugin at startup. Manual update checks will fail. No developer-hosted update service is contacted or required.

## Features

### 0.3.0: Full Reading Panel

The Codex icon opens a full-height panel over Zotero's right content area, including its native header. Only chat content scrolls; the underlying item modules cannot receive focus while covered. The panel stays within the available width, leaving the icon rail accessible. Click another module icon or **×** to return to Zotero. Each paper retains its own conversation and draft.

### 0.2.1: Reader Sidebar Fix

Fixes the blank reader panel and text overflowing beside the navigation icon. Fluent translations now target label and tooltip attributes, preserving the custom section DOM. Restart Zotero after updating to reload the localization resources.

### Codex-style Reading Workspace

A collapsible conversation list, uncluttered message area, and rounded composer fixed below the scrolling messages. Paper context opens in an editable panel; connection settings, copying the full conversation, and saving notes are available under **⋯**. Wide panels show history beside the chat, while narrow panels use a drawer. Light and dark appearance follow the system. This is an independent Zotero interface inspired by Codex, not an embedded copy of the desktop app.

### Read and Ask Questions About Papers

**Selected-text context**

Select text in a PDF and choose **Add to Codex Context** from the popup menu.

The selected text is added to your local context draft. No request is sent at this stage.

**Editable paper context**

Click **Paper Context (+)** beside the composer to inspect, edit, or remove content before sending it to Codex.

**PDF text extraction**

Click **Extract First 20 Pages** to extract text using Zotero's local PDF extraction capabilities.

- Maximum extraction length: 60,000 characters
- A warning is displayed when the extracted text is truncated
- Scanned documents require OCR before text extraction
- Images and figures are not analyzed in the current version

**Interactive conversations**

Enter a question and click **Send**, or press **Ctrl+Enter**, to receive streamed responses from Codex.

The **Summarize**, **Explain**, and **Translate** shortcuts populate the question editor without automatically submitting a request.

### Conversation Management

Each PDF maintains a separate conversation.

- **Stop:** Interrupt the current response.
- **New Conversation:** Start a fresh context without deleting saved Codex history.
- **Copy Conversation:** Copy the conversation as plain text.
- **Save as Note:** Save the conversation to the Zotero library.

Conversation content is only written to your Zotero library when you explicitly select **Save as Note**. If Zotero synchronization is enabled, the saved note may be uploaded according to your Zotero sync settings.

### What Gets Sent to Codex?

A request can include:

- Your question
- The current paper's title
- Text explicitly included in the context editor
- Previous context from the current Codex conversation

The plugin does **not** automatically read the full paper unless you explicitly extract or add text.

It does not automatically scan your Zotero library.

## Integration with Codex App and CLI

Codex Reader communicates with a locally launched `codex app-server` process.

### What Can Be Reused?

**Existing authentication and configuration**

The plugin uses your existing `CODEX_HOME` directory, or Codex's default directory when `CODEX_HOME` is not specified.

This allows it to reuse authentication and configuration recognized by Codex.

**Models and integrations**

The plugin can access models, MCP servers, skills, and plugin services available through the Codex CLI app-server.

It does not copy or overwrite your Codex configuration.

**Conversation history**

The plugin can retrieve existing Codex conversations through `thread/list`.

Open the conversation list with the top-left sidebar button, click **Load Codex History**, then click a conversation to continue in a new branch.

This creates a new conversational branch while preserving the original conversation.

**Account limits**

Usage and rate-limit information can be displayed when provided by Codex's account usage interface.

### Limitations

Codex Reader is not a fully synchronized replacement for Codex App.

- It launches an independent `codex app-server` process rather than attaching to the currently running Codex App process.
- Branching copies conversation context; subsequent messages are not synchronized bidirectionally with the original conversation.
- App-specific UI features, temporary connectors, browser-host integrations, and approval interfaces may not be available to the independent app-server.
- Shared conversation storage does not guarantee that newly created conversations immediately appear in Codex App's sidebar or that the App's live execution state is accessible.
- The plugin reuses global Codex settings, but does not automatically inherit the working directory, project-level configuration, or `AGENTS.md` from your currently open Codex App project.
- The history panel displays up to 40 recent conversations.
- Deleting Codex conversation history is not supported in the current version.

If Zotero and Codex App use different accounts, operating-system users, or `CODEX_HOME` locations, they will not automatically share authentication or conversation data.

If model discovery or history retrieval fails, the plugin preserves the error information for troubleshooting rather than silently switching to another service.

## Security and Privacy

Codex Reader is designed to provide a small, auditable integration with your existing Codex installation.

The plugin contains:

- No advertising or developer-operated telemetry
- No developer-hosted backend
- No remote JavaScript or third-party JavaScript dependencies
- No automatic update downloads
- No additional HTTP listening service

### Local Communication

The plugin uses Mozilla's **Subprocess** API to launch the installed native Codex executable directly.

Communication occurs through structured JSON messages over **stdin/stdout**.

It does not open a listening network port or execute the Codex process through a command-line shell.

### Authentication and Credentials

The plugin does not read, copy, or display:

- `auth.json`
- API keys
- OAuth tokens

Authentication is handled by Codex itself.

The official authentication page is opened only when you explicitly click **Official Sign-in**.

### Local Data Storage

The plugin stores only the configured executable path in its own settings.

Conversation displays and unsent drafts remain in Zotero process memory and are not restored after Zotero closes.

This does not mean that all Codex conversation data is stored exclusively in memory.

Codex may independently save conversation history and maintain logs according to its own configuration.

### Network Requests and Data Sharing

**Using a local Codex CLI does not mean that the language model runs locally.**

Paper context and questions are submitted to the model selected through your current Codex configuration.

Codex's own behavior—including model-provider requests, conversation storage, logs, telemetry, MCP servers, plugins, and hooks—remains governed by your existing Codex configuration.

Consequently:

- The plugin does not independently send paper content to a developer-operated server.
- Content submitted to Codex may be transmitted to its configured model provider.
- Connected MCP services, plugins, and hooks may process information according to their own behavior and permissions.
- The plugin cannot guarantee that all conversation data stays on your device.

### Content Safety

Extracted paper text and model responses are treated as untrusted content.

Responses are rendered using `textContent`, rather than executed as HTML. Remote images embedded in model responses are not loaded.

New and branched conversations use a read-only sandbox with approval on demand, without changing your global Codex configuration.

Operations requiring client approval, such as certain commands, file operations, or service interactions, trigger confirmation requests.

### Local Permissions and Source Auditing

Like other Zotero desktop plugins, Codex Reader runs with elevated local application privileges.

You can review the complete implementation in the `addon/` directory.

The distributed plugin package contains only the corresponding addon files.

### Relationship to llm-for-zotero

This project uses a small, independent implementation and does not copy runtime code from the reference plugin.

The project [llm-for-zotero](https://github.com/yilewang/llm-for-zotero) served as a functional reference.

No comprehensive security audit of that project has been performed here. Privacy considerations should not be interpreted as evidence that the referenced plugin leaks data.

## Troubleshooting

### Codex Executable Not Found

Open **Settings (⋯)** in the sidebar and manually specify the full Codex executable path.

For a typical Windows npm installation:

```text
C:\Users\<username>\AppData\Roaming\npm\codex.cmd
```

The plugin resolves this wrapper path to the native `codex.exe` inside the installed package.

It does not execute `.cmd` or `.ps1` scripts.

For other installation methods, specify the actual native Codex executable.

### Authentication Failed

If the plugin reports that Codex is not authenticated:

1. Open a terminal.
2. Verify that `codex login` has completed successfully.
3. Alternatively, click **Official Sign-in** in the plugin sidebar.

You do not need to sign in again if Codex already recognizes your authenticated account.

### Reconnecting

Click **Reconnect** to restart the plugin's runtime connection.

Reconnecting disconnects all active plugin sessions and clears the in-memory conversation display.

Previously saved Codex history remains accessible through the history panel.

Reconnection is disabled while a response is being generated.

## Development

### Requirements

Building and testing require:

- Node.js for running tests
- Python 3 for packaging

The build process does not download additional dependencies.

### Run Tests

```powershell
node --test tests/core.test.cjs
```

### Build the Plugin

```powershell
python scripts/build.py
```

The resulting XPI package and its SHA-256 checksum file are generated in the `dist/` directory.

### Integration Diagnostics

`scripts/probe.cjs` checks the local Codex environment, including:

- App-server initialization
- Account availability
- Model discovery
- Conversation history retrieval

The diagnostic script does not read credential files, print email addresses, tokens, or conversation content, or initiate model generation.

### Zotero Smoke Tests

The following files support isolated integration testing:

- `scripts/prepare-smoke.py`
- `tests/zotero-smoke.js`

These tests use a generated sample PDF to verify:

- Plugin loading in Zotero
- PDF text extraction
- Selected-text handling
- Plain-text response rendering
- Local communication with Codex

Test scripts are not included in the distributed plugin package.

## Project Structure

| File | Description |
|---|---|
| `addon/bootstrap.js` | Plugin lifecycle management and sidebar registration |
| `addon/content/core.js` | JSON protocol, streaming responses, context boundaries, and session isolation |
| `addon/content/host.js` | Native process management, authentication, model discovery, history, and approvals |
| `addon/content/sidebar.js` | PDF sidebar, selected text, document preview, conversations, and notes |
| `addon/content/sidebar.css` | Sidebar styling with Zotero light/dark theme support |

## References

The implementation uses the following technical references:

- [Codex App Server Documentation](https://learn.chatgpt.com/docs/app-server)
- [Zotero 7 Developer Documentation](https://www.zotero.org/support/dev/zotero_7_for_developers)

Compatibility testing also referenced the APIs bundled with the locally installed Zotero version and protocol schemas generated by the local Codex installation.

## License

This project is licensed under the **MIT License**.

See [LICENSE](LICENSE) for details.