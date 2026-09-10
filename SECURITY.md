# Security Policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/xp266/dsh-tui/security/advisories/new)
instead of opening a public issue. Include the affected version, a
reproduction, and the impact you observed. You can expect an initial response
within a few days.

## Scope

dshtui runs inside the DeepSeek Harness (`dsh`) process and renders its
terminal interface. Credentials, sandbox policy, and model access are owned by
the harness and its services, not by this plugin:

- Vulnerabilities in the harness itself belong in the
  [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) project.
- For this plugin, reports of interest include terminal escape-sequence
  injection from rendered content, clipboard handling, and anything that
  leaks data the harness did not intend to surface.

## Supported versions

Only the latest published version of `@xp266/dshtui` is supported with
security fixes.
