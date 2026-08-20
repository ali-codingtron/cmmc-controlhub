---
name: Azure Blob deployment storage
description: Deployment storage decision for Azure App Service and its credential model.
---

New Azure App Service deployments use Azure Blob Storage for persistent
evidence, documents, SSP files, and generated exports.

**Why:** The app must run independently of Replit services, and managed identity
avoids placing storage account keys or connection strings in a container image.

**How to apply:** Configure the storage account URL, container, and blob prefixes
as App Service settings. Prefer the Web App's system-assigned managed identity
with the Storage Blob Data Contributor role. A connection string or account key
is supported only as a fallback for local development or environments where
managed identity is unavailable.