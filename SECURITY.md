# Security Policy

## Supported development line

Security fixes target the current `main` branch while GeoHarness Platform v1.0 is under development. Release-specific support information will be added when `v1.0.0` is published.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting / Security Advisory flow for `Star-Learning/GeoHarness`. Do not open a public Issue containing credentials, exploitable paths, private datasets or proof-of-concept payloads.

Include:

- affected commit or version;
- operating system and DeepSeek Harness version;
- reproduction steps with secrets removed;
- expected impact;
- whether the issue crosses a Workspace, filesystem or network boundary.

## Security boundaries

GeoHarness treats the following as security-sensitive:

- uploaded archives and vector files;
- Workspace and export paths;
- isolation between Harness Sessions;
- Provider credentials and Base URLs;
- Python subprocess arguments and cancellation;
- loopback Connection RPC payloads;
- untrusted feature properties rendered in the browser.

Credentials must remain in the native Harness credential store. GeoHarness must not return, persist, log or copy secret values into Layer metadata, Run Manifests, Tool Results, browser state or diagnostics.
