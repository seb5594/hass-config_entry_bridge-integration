# Submitting to the Marketplace (HACS default catalog)

The repository is prepared; the submission itself is a manual step with your token.

## Already in place

| Requirement | Where |
| --- | --- |
| A stable release | Every new version on `main` publishes one (the first regular one is `2026.11.26.1`) |
| `hacs.json` and a valid `manifest.json` (keys sorted for hassfest) | repository root, `custom_components/config_entry_panel/` |
| Brand images | `custom_components/config_entry_panel/brand/` (`icon`, `logo`, dark logo, `@2x`) |
| License | `LICENSE` |
| Description | the repository description |
| Passing checks | the **Marketplace catalog** workflow runs the HACS action without ignored checks plus hassfest |

## Still yours

1. **Topics** in the repository settings (the HACS action fails without them):
   `home-assistant`, `hacs`, `hacs-integration`, `home-assistant-custom-component`, `lovelace`, `lovelace-card`, `dashboard`, `config-entry`, `options-flow`, `permissions`.
2. **Issues** switched on in the repository settings.
3. The secret **`CATALOG_SUBMISSION_TOKEN`** (classic token with `public_repo`).

## Steps

1. Run **Actions → Marketplace catalog → Run workflow** on `main` without options. It validates and uploads the proposed entry as an artifact. Fix what it reports.
2. When it is green for the release commit, run it again on `main` with **submit** and **publishing_docs_read** switched on. That opens the pull request in `hacs/default`.
3. The HACS maintainers review it; answer their comments in that pull request.

See also the [publishing requirements](https://contributors.home-assistant.io/marketplace/guides/catalog/).
