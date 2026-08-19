---
name: Azure container release
description: Security constraints for ControlHUB GitHub Actions deployments to Azure Container Registry and App Service.
---

Production Azure releases authenticate GitHub Actions to Azure through OIDC,
not a stored service-principal credential. The production GitHub Environment
must be limited to the protected main branch, and the workflow must independently
refuse non-main refs. App Service must be configured with the fully-qualified
ACR manifest digest after each push, not an image tag.

**Why:** A long-lived client secret is harder to protect and rotate. An
environment-only OIDC subject does not itself constrain a manually dispatched
run to a trusted branch. A SHA-shaped tag can still be repointed, while a
manifest digest identifies immutable content.

**How to apply:** Preserve OIDC token permission, main-branch controls,
least-privilege ACR/App Service roles, managed-identity ACR pulls, action SHA
pins, and digest-based deployment whenever maintaining the release pipeline.