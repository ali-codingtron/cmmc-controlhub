---
name: Azure container release
description: Security constraints for ControlHUB GitHub Actions deployments to Azure Container Registry and App Service.
---

Azure releases authenticate GitHub Actions to Azure through OIDC, not a stored
service-principal credential. Production maps only from the protected main
branch and staging only from the protected staging branch. The workflow runs
automatically after changes land on either deployment branch; dev remains the
Replit development branch. App Service must be configured with the
fully-qualified ACR manifest digest after each push, not an image tag.

Staging and production require separate ACRs and separate Entra deployment
identities with roles scoped only to their own registry and Web App.

**Why:** A long-lived client secret is harder to protect and rotate. A
branch-specific push trigger avoids any manual environment selection or
cross-environment dispatch. A SHA-shaped tag can still be repointed, while a
manifest digest identifies immutable content. Tag prefixes do not isolate
environments when both identities can write to a shared registry.

**How to apply:** Preserve OIDC token permission, protected branch controls,
one environment per branch, separate ACR/identity boundaries, least-privilege
ACR/App Service roles, managed-identity ACR pulls, action SHA pins, and
digest-based deployment whenever maintaining the release pipeline.