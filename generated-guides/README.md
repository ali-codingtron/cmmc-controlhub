# Generated Guides

This directory contains off-app generated documentation files.
Files here are **not exposed in the Control HUB UI**, database, or any app route.

## Files

| File | Description |
|------|-------------|
| `VTCCORP.US_Control_HUB_Assessor_User_Guide.pdf` | Assessor read-only user guide with live screenshots |

## Regenerating

Run from the workspace root:

```
pnpm generate:assessor-guide
```

This will:
- Capture fresh screenshots from the live app (assessor perspective)
- Regenerate the PDF with today's date
- Overwrite the existing file in this directory

**Requirements:** The API server and cmmc-app workflows must be running.

## Download

Open the Replit file tree → `generated-guides/` → right-click the PDF → Download.
