# HR and Procurement Backend

This project is a TypeScript-based backend for HR, finance, procurement, and user-management workflows. The goal is to keep the codebase organized enough for junior developers to understand quickly while still supporting complex business rules.

## What this project does

- Authentication and role-based access control
- Leave, travel, appraisal, and expense workflows
- Procurement flows such as purchase requests, RFQs, purchase orders, and goods received
- File handling, notifications, and status updates
- API helpers for pagination, search, and response formatting

## Quick start

```bash
npm install
npm run dev
```

Create a local environment file before running the app. The project expects config values such as database connection details, JWT secrets, and mail settings.

## Project layout

- src/controllers: HTTP handlers for each feature
- src/services: business logic for each feature
- src/models: Mongoose schemas and types
- src/routes: route registration
- src/middleware: auth, validation, and error handling
- src/utils: shared helpers and common utilities
- src/config: environment and database setup

## How to navigate the app

1. Start with the route file for the feature you want to work on.
2. Follow that route into its controller.
3. Then inspect the corresponding service for the business logic.
4. Use the models and shared utilities when the logic needs data access or common behavior.

## Simple development conventions

- Keep controllers thin and focused on request/response handling.
- Put business rules inside services.
- Reuse helpers from src/utils instead of duplicating common logic.
- Prefer small, descriptive functions over large multi-purpose ones.

## Common scripts

```bash
npm run dev      # start the app in development mode
npm run build    # compile TypeScript
npm run lint     # run lint checks
```
