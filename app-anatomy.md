# App Anatomy

This document explains how data moves through the application, feature by feature, from the moment an HTTP request arrives to the moment a response is returned.

## 1. High-level architecture

The backend is an Express + TypeScript + Mongoose application with a layered structure:

- Routes define the public API surface.
- Controllers receive the request, read inputs, and delegate work.
- Services contain the business logic.
- Models define MongoDB schemas and persistence behavior.
- Middleware handles authentication, validation, file uploads, error handling, and access control.
- Utilities provide shared behavior such as response formatting, logging, ID handling, and common helpers.

Typical request flow:

1. Request enters Express through a route.
2. Middleware runs (authentication, validation, upload parsing, rate limiting).
3. A controller extracts request data and calls a service.
4. The service performs business rules and talks to Mongoose models.
5. The service may also interact with file storage, notifications, comments, or status workflows.
6. The controller sends a standardized response back to the client.

---

## 2. Request lifecycle in this app

### A. Entry point
- The app boots from [src/server.ts](src/server.ts).
- It creates the Express app, applies middleware, mounts route groups, and starts the server.

### B. Routing
- The main router in [src/routes/index.ts](src/routes/index.ts) mounts feature modules:
  - Auth
  - Users
  - Finance
  - Procurement
  - HR
  - Admin

### C. Middleware chain
Common middleware includes:
- Authentication and authorization in [src/middleware/auth.middleware.ts](src/middleware/auth.middleware.ts)
- Request validation in [src/middleware/validate.middleware.ts](src/middleware/validate.middleware.ts)
- File upload handling via Multer in route files
- Global error handling in [src/middleware/error.middleware.ts](src/middleware/error.middleware.ts)

### D. Controller layer
Controllers are thin and mostly do three things:
- read request input
- call a service
- send the response

### E. Service layer
Services contain most of the business logic, for example:
- create/update/delete workflow records
- apply role-based rules
- check balances or status transitions
- attach comments, files, or notifications

### F. Model layer
Models in [src/models](src/models) define the MongoDB documents and schema behavior.

### G. Response layer
Responses are standardized through [src/utils/responseHandler.ts](src/utils/responseHandler.ts), which returns consistent JSON payloads with success flags, status codes, messages, and optional data/pagination.

---

## 3. Shared cross-cutting concerns

### Authentication and authorization
- JWT access tokens and refresh tokens are issued during auth flows.
- Protected routes rely on middleware to verify tokens and user roles.
- The user object is attached to the request and later used by controllers and services.

### Validation
- Request body/query validation is handled by schema validators under [src/validators](src/validators).
- Invalid input is rejected before business logic runs.

### File uploads
- Multipart upload requests are parsed by Multer.
- Uploaded files are passed to services and then stored through the file service abstraction.

### Comments and workflow status
Many features support:
- comments
- status transitions
- draft and submission workflows
- copy-to-recipient operations

These behaviors are usually handled in the service layer with shared helper logic.

### Error handling
Errors are normalized through the app error system so controllers and services can throw meaningful operational errors that the middleware handles centrally.

---

## 4. Feature-by-feature data flow

## 4.1 Authentication

### Routes
- [src/routes/auth.routes.ts](src/routes/auth.routes.ts)

### Data path
- Register/login/refresh/forgot-password/reset-password request enters the auth routes.
- The controller validates basic request values and calls the auth service.
- The service checks the user model, hashes or compares credentials, creates tokens, and returns a response.

### In
- email, password, names, refresh token

### Process
- validate input
- look up user in MongoDB
- verify password or token
- create JWT access/refresh tokens

### Out
- user profile data
- access and refresh tokens
- success/error messages

### Key files
- [src/controllers/auth.controller.ts](src/controllers/auth.controller.ts)
- [src/services/auth.service.ts](src/services/auth.service.ts)
- [src/models/User.model.ts](src/models/User.model.ts)

---

## 4.2 User management

### Routes
- [src/routes/user.routes.ts](src/routes/user.routes.ts)

### Data path
- Requests for profile management, user lookup, staff creation, avatar upload, and employment info updates all go through the user controller.
- The controller delegates to the user service, which performs permission checks and updates the user model.

### In
- profile fields
- role changes
- employment details
- avatar files
- password change requests

### Process
- authenticate the current user
- enforce admin/super-admin rules where needed
- update or fetch user data from MongoDB
- upload avatar files if provided

### Out
- updated user objects
- paginated user lists
- avatar URLs or metadata
- success/error responses

### Key files
- [src/controllers/user.controller.ts](src/controllers/user.controller.ts)
- [src/services/user.service.ts](src/services/user.service.ts)
- [src/services/employment-info.service.ts](src/services/employment-info.service.ts)
- [src/services/user-excel.service.ts](src/services/user-excel.service.ts)

---

## 4.3 HR: Leave

### Routes
- [src/routes/hr.routes.ts](src/routes/hr.routes.ts)

### Data path
- A leave request starts as a draft or a submitted application.
- The controller receives the payload and files, then passes them to the leave service.
- The service calculates days, validates leave balance, persists the leave record, updates balances, and may notify reviewers.

### In
- leave type
- dates
- reason
- reviewer assignment
- optional uploaded files

### Process
- calculate working/calendar days
- validate leave balance rules
- create/update leave document
- update balance state
- send reviewer notifications
- attach files and comments

### Out
- saved leave request
- leave stats and balance info
- comments and file metadata
- updated leave balance history

### Key files
- [src/controllers/hr.controller.ts](src/controllers/hr.controller.ts)
- [src/services/leave.service.ts](src/services/leave.service.ts)
- [src/services/leave.helpers.ts](src/services/leave.helpers.ts)
- [src/models/Leave.model.ts](src/models/Leave.model.ts)
- [src/models/LeaveBalance.model.ts](src/models/LeaveBalance.model.ts)

---

## 4.4 HR: Staff strategy

### Routes
- [src/routes/hr.routes.ts](src/routes/hr.routes.ts)

### Data path
- Staff strategy requests follow the same pattern as leave requests.
- Controllers receive the payload and optional files, then the service manages draft creation, submission, updates, and status approval.

### In
- strategy details
- relevant staff information
- optional supporting documents

### Process
- create draft or submitted strategy
- validate ownership and workflow permissions
- update or approve strategy status
- support comments and file attachments

### Out
- strategy document
- status updates
- comments and file records

### Key files
- [src/controllers/hr.controller.ts](src/controllers/hr.controller.ts)
- [src/services/staff-strategy.service.ts](src/services/staff-strategy.service.ts)
- [src/models/StaffStrategy.model.ts](src/models/StaffStrategy.model.ts)

---

## 4.5 HR: Appraisal

### Routes
- [src/routes/hr.routes.ts](src/routes/hr.routes.ts)

### Data path
- Appraisal data moves through draft creation, submission, updates, objective changes, signature handling, and status transitions.
- The appraisal service contains most of the workflow behavior.

### In
- appraisal content
- objectives and ratings
- signature type/comments
- optional files

### Process
- create or update appraisal document
- apply approval/rejection rules
- update objectives
- handle digital signatures
- add comments or files

### Out
- appraisal record
- status updates
- approval outcomes
- comments and file attachments

### Key files
- [src/controllers/hr.controller.ts](src/controllers/hr.controller.ts)
- [src/services/appraisal.service.ts](src/services/appraisal.service.ts)
- [src/models/Appraisal.model.ts](src/models/Appraisal.model.ts)

---

## 4.6 Finance: Concept notes

### Routes
- [src/routes/finance.routes.ts](src/routes/finance.routes.ts)

### Data path
- Concept note requests flow from route to controller to concept note service to MongoDB.
- The service supports drafts, submissions, updates, status changes, comments, and copying to other recipients.

### In
- concept note content
- creator identity
- attachments
- status change payloads

### Process
- save draft or submit request
- validate permissions and workflow rules
- update status
- attach comments/files

### Out
- full concept note document
- stats and list data
- comments and attached files

### Key files
- [src/controllers/finance.controller.ts](src/controllers/finance.controller.ts)
- [src/services/concept-note.service.ts](src/services/concept-note.service.ts)
- [src/models/ConceptNote.model.ts](src/models/ConceptNote.model.ts)

---

## 4.7 Finance: Advance requests

### Data path
- Similar to concept notes, but focused on financial advance workflows.
- The service handles save, submit, update, status change, comments, and copy actions.

### In
- amount details
- purpose and supporting data
- attachments

### Process
- validate request payload
- create or update a request document
- update approval workflow
- manage files/comments

### Out
- advance request document
- stats and records
- workflow transitions

### Key files
- [src/controllers/finance.controller.ts](src/controllers/finance.controller.ts)
- [src/services/advance-request.service.ts](src/services/advance-request.service.ts)
- [src/models/AdvanceRequest.model.ts](src/models/AdvanceRequest.model.ts)

---

## 4.8 Finance: Expense claims

### Data path
- Expense claims follow the same lifecycle as the other finance workflows.
- They include creation, updates, submission, approval-state changes, comments, and file handling.

### In
- expense details
- claim items
- receipts or attachments

### Process
- create/edit claim request
- validate and persist claim data
- update status through approval workflow
- attach supporting files

### Out
- expense claim record
- stats and lists
- comments and file references

### Key files
- [src/controllers/finance.controller.ts](src/controllers/finance.controller.ts)
- [src/services/expense-claims.service.ts](src/services/expense-claims.service.ts)
- [src/models/ExpenseClaims.model.ts](src/models/ExpenseClaims.model.ts)

---

## 4.9 Finance: Travel requests

### Data path
- Travel request data follows the standard workflow pattern: draft, submit, update, approve/reject, comments, copy, and file management.

### In
- trip purpose
- travel details
- supporting documents

### Process
- save or submit request
- validate business rules
- update approval workflow
- manage comments/files

### Out
- travel request record
- workflow status
- associated files and comments

### Key files
- [src/controllers/finance.controller.ts](src/controllers/finance.controller.ts)
- [src/services/travel-request.service.ts](src/services/travel-request.service.ts)
- [src/models/TravelRequest.model.ts](src/models/TravelRequest.model.ts)

---

## 4.10 Finance: Payment requests and payment vouchers

### Data path
- These flows represent downstream financial approvals.
- They receive request data from the client, process it through their service layer, and produce a persisted payment workflow document.
- Payment vouchers also support file replacement operations.

### In
- payment request details
- payment voucher data
- attachments
- status updates

### Process
- create/update payment documents
- move through approval stages
- store associated files
- support comments and copying

### Out
- payment request/voucher records
- status information
- file references and comments

### Key files
- [src/controllers/finance.controller.ts](src/controllers/finance.controller.ts)
- [src/services/payment-request.service.ts](src/services/payment-request.service.ts)
- [src/services/payment-voucher.service.ts](src/services/payment-voucher.service.ts)
- [src/models/PaymentRequest.model.ts](src/models/PaymentRequest.model.ts)
- [src/models/PaymentVoucher.model.ts](src/models/PaymentVoucher.model.ts)

---

## 4.11 Procurement: Purchase requests

### Routes
- [src/routes/procurement.routes.ts](src/routes/procurement.routes.ts)

### Data path
- Purchase requests move through create/update/status/comment flows using the procurement controller and service.

### In
- item needs
- requested quantities
- justification
- accompanying files

### Process
- create draft or submit purchase request
- validate request details
- apply status transitions
- attach comments and files

### Out
- purchase request record
- status and workflow data
- comments and file references

### Key files
- [src/controllers/procurement.controller.ts](src/controllers/procurement.controller.ts)
- [src/services/purchase-request.service.ts](src/services/purchase-request.service.ts)
- [src/models/PurchaseRequest.model.ts](src/models/PurchaseRequest.model.ts)

---

## 4.12 Procurement: RFQs

### Data path
- RFQs are created from purchase request context, updated, and then sent to vendors.
- The flow includes draft creation, submission, status updates, and sending RFQs with optional PDF attachments.

### In
- requested items
- vendor information
- RFQ content
- optional PDF attachment

### Process
- build RFQ document
- persist it
- update status
- send vendor distribution information

### Out
- RFQ document
- vendor communication payloads
- status state

### Key files
- [src/controllers/procurement.controller.ts](src/controllers/procurement.controller.ts)
- [src/services/rfq.service.ts](src/services/rfq.service.ts)
- [src/models/RFQ.model.ts](src/models/RFQ.model.ts)

---

## 4.13 Procurement: Purchase orders

### Data path
- POs can be created either from an RFQ or independently.
- The service handles status updates and optional signed PDF attachments.

### In
- selected vendor
- negotiated items
- purchase conditions
- supporting documents

### Process
- create PO from RFQ or independently
- persist PO document
- update status
- attach files/comments when relevant

### Out
- purchase order record
- status updates
- supporting documents

### Key files
- [src/controllers/procurement.controller.ts](src/controllers/procurement.controller.ts)
- [src/services/purchase-order.service.ts](src/services/purchase-order.service.ts)
- [src/models/PurchaseOrder.model.ts](src/models/PurchaseOrder.model.ts)

---

## 4.14 Procurement: Goods received notes

### Data path
- GRNs are created after purchase orders and summarize incoming goods.
- They support listing by purchase order, summary stats, file attachment, and updates.

### In
- received items
- quantities
- delivery information
- files

### Process
- create or update GRN
- associate it with a PO
- attach supporting documents
- expose summary and lookup endpoints

### Out
- GRN document
- summary data
- lookup results

### Key files
- [src/controllers/procurement.controller.ts](src/controllers/procurement.controller.ts)
- [src/services/goods-received.service.ts](src/services/goods-received.service.ts)
- [src/models/GoodsReceived.model.ts](src/models/GoodsReceived.model.ts)

---

## 4.15 Admin module

### Routes
- [src/routes/admin.routes.ts](src/routes/admin.routes.ts)

### Data path
- Admin routes manage application-level setup and operational data.
- This includes projects, vendors, system settings, and employment info administration.

### In
- project and vendor details
- system settings values
- migration actions
- employment audit data

### Process
- create/update/list/remove admin resources
- manage global settings
- expose migration status and run migrations
- inspect employment info state

### Out
- project/vendor/settings payloads
- migration status/results
- employment info summaries

### Key files
- [src/controllers/admin.controller.ts](src/controllers/admin.controller.ts)
- [src/services/project.service.ts](src/services/project.service.ts)
- [src/services/system-settings.service.ts](src/services/system-settings.service.ts)
- [src/models/Project.model.ts](src/models/Project.model.ts)
- [src/models/Vendor.model.ts](src/models/Vendor.model.ts)

---

## 5. Common data patterns across features

Most workflow features follow the same pattern:

1. Create or edit a draft
2. Submit the draft
3. Move through approval or review status
4. Allow comments and file attachments
5. Support copying or forwarding the request
6. Return a normalized response

This makes the app feel consistent even though each business domain has its own rules.

---

## 6. Data storage and external integrations

### Primary storage
- MongoDB through Mongoose models

### File handling
- uploaded files are processed through the file service abstraction
- files can be linked to workflow records and retrieved later

### Notifications and email
- the notification and email services are used to inform reviewers, approvers, and other users

### Environment and config
- app settings are loaded from [src/config/env.ts](src/config/env.ts)
- database connection setup is handled by [src/config/database.ts](src/config/database.ts)

---

## 7. Practical mental model for developers

When you want to understand any feature, follow this path:

1. Find the route in the relevant route file
2. Trace the controller handler
3. Follow the service method that contains the business logic
4. Check the related model for persistence behavior
5. Inspect any file or notification calls for side effects

In short:
- Routes = entry points
- Controllers = request adapters
- Services = business logic
- Models = data storage
- Utilities = shared support

This is the main shape of the application’s data movement architecture.
