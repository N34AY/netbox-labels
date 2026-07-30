# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities. Instead, use
[GitHub's private vulnerability reporting](https://github.com/N34AY/netbox-labels/security/advisories/new)
for this repository. You should get an initial response within a few days.

Please include:
- The plugin and NetBox version you're running.
- Steps to reproduce, and the impact (what an attacker could actually do).

## Trust model

`html_code`/`css_code`/`js_code` on a QR template are rendered and executed as-is by the
browser of anyone who views that object's label — the same trust model NetBox itself uses for
Export Templates and Custom Links. Only users holding `netbox_labels.add_qrtemplate` /
`change_qrtemplate` should be trusted to author or edit templates; that permission is
effectively equivalent to granting arbitrary JS execution in other users' browsers (stored XSS by
design, not a bug) and should be scoped accordingly. See the README's
[Trust model](README.md#trust-model) section for the full explanation.

Given that, the vulnerability classes we're most interested in hearing about are ones that don't
require template-author privileges — e.g. an object's own field data (which non-privileged users
may be able to edit) breaking out of the escaped/sandboxed rendering pipeline, or anything
reachable by a user who only has view/print access to labels.

## Supported versions

This plugin tracks NetBox's own currently-supported releases (see the README's Requirements
section). Fixes land on `main`; there are no separate backport branches at this time.
