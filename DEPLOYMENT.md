# Netlify + MySQL deployment

## What must exist

The frontend, Netlify Function, authentication, and schema are in this repository. Deployment also requires a network-reachable MySQL service that you control. Netlify does not turn a local MySQL installation into a hosted database. Do not expose your computer's MySQL root account to the internet.

Use a MySQL provider's host, port, database name, dedicated username, password, and TLS/CA details. Provisioning may incur provider charges; select a plan yourself. Keep all connection secrets outside GitHub.

## 1. Prepare the hosted schema

Use a private local environment file with the hosted connection settings (back up your local `.env` settings first), or set those values in your shell securely. Run:

```sh
npm ci
npm run db:setup
npm run test:db
```

The setup uses an existing provider database where possible. It only attempts to create a database if none exists. Its credentials need CREATE TABLE permissions for migrations. Application credentials need SELECT/INSERT/UPDATE/DELETE on this app's tables. TLS must validate the server certificate; use `MYSQL_SSL_CA` if the provider supplies a private CA. Never disable certificate validation.

## 2. Set private Netlify environment variables

In your Netlify project's Environment variables settings, add these with **Functions** scope (or all scopes), and trigger a new deployment:

| Variable | Value |
| --- | --- |
| `MYSQL_ENABLED` | `true` |
| `MYSQL_HOST` | Provider hostname, not localhost or 127.0.0.1 |
| `MYSQL_PORT` | Provider port, usually 3306 |
| `MYSQL_DATABASE` | Existing provider database name |
| `MYSQL_USER` | Dedicated application database user |
| `MYSQL_PASSWORD` | Its private database password |
| `MYSQL_SSL` | `true` |
| `MYSQL_SSL_CA` | Optional provider CA PEM, with real newlines or literal `\n` |

Runtime credentials are configured in Netlify's UI, CLI, or API, not in the public frontend or `netlify.toml`. Allow incoming database connections according to your provider's network rules. A database that only permits private-network connections cannot be reached by ordinary Netlify Functions without additional networking arrangements.

## 3. Deploy the complete GitHub repository

Use production branch `main`, build command `npm run build`, publish directory `dist`, and function directory `netlify/functions`. The repository configuration selects Node.js 22 and bundles the MySQL driver. Do not use frontend-only drag-and-drop deployment. `/api/vault` should return 401 before sign-in, not 404, local-storage mode, or a configuration error. Errors never silently create a local vault.

## 4. Restore your existing data

Before switching, export your existing local vault and retain its master password and trusted checksum. On the hosted site register one account. At the vault screen choose **Restore an existing encrypted backup**, import the exported file, and authenticate it with its master password. This moves encrypted data into the hosted database. It does not transmit the master password.

If local and hosted apps use different MySQL servers, accounts and data are separate until migrated. An account registration on the hosted site cannot discover data that exists only on your local database. Do not repeatedly register: use **Sign in** with the same email and account password. Then unlock with the original master password. Clearing cookies or using a second browser should require sign-in again, never a new vault for that account.

## 5. Verify

1. Register a test account, create one vault, and save a fake credential.
2. Sign out and sign in again. Unlock the existing vault.
3. Open a clean browser or private window. Sign in with the same account and unlock with the same master password. The saved credential should be there without creating a new vault.
4. Check `accounts`, `sessions`, `vaults`, and `vault_entries` in hosted MySQL. Account passwords are salted hashes, session tokens are hashed, and site credentials remain encrypted.
5. Confirm a different account cannot retrieve the first account's vault.

The checked-in tests cover this flow using the same HTTP adapter as the Netlify Function plus real local MySQL. A live Netlify-to-hosted-MySQL connection is only verified after hosted credentials and schema are configured. Email verification, password-reset flows, and an independent security audit remain out of scope for this educational project.
