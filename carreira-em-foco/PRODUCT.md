# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are UNIFAMETRO students organizing their careers during university. They use the product to structure and keep track of their activities, objectives, skills, and next steps. Coordination staff support students by sharing opportunities and responding to mentorship requests.

## Product Purpose

Carreira em Foco helps UNIFAMETRO students develop better organization and control of their career activities and goals. It aims to be a guide through university by bringing career planning together with opportunities such as job openings and courses.

How success is measured has not been defined.

## Positioning

The product combines individual career planning with opportunities and support from the university coordination team, giving students a practical guide for navigating university life and career development.

## Operating Context

Students create a profile, record skills and goals, organize action items and a month- or semester-based timeline, and explore opportunities. They can also use a career profile assessment, build a résumé, request mentorship, set email reminders, and provide feedback.

Coordination staff publish job openings and events, respond to mentorship requests, review aggregate usage and feedback, and export reports.

## Capabilities and Constraints

- The web application supports student and coordination roles, with email/password, Google, and Microsoft 365 sign-in options depending on server configuration.
- Career-planning features include profiles, skills, goals, action items, a timeline, a professional profile assessment, résumé generation, achievements, opportunities, mentorship, reminders, and feedback.
- Coordination features include publishing opportunities and events, responding to mentorship requests, aggregate reporting, and CSV export.
- Email delivery and external sign-in providers require server-side configuration; the product can run without email delivery enabled.
- The existing implementation uses Node.js 22.13 or newer, built-in SQLite, and no external package dependencies.
- The system stores personal and career-planning data. Coordination reporting is aggregate, except for mentorship requests, which contain identifying details for an individual response.
- Success metrics, retention policy, legal basis, account-deletion process, and any requirement for verified student email remain undecided and need institutional agreement.

## Brand Commitments

- Product name: Carreira em Foco.
- The product serves UNIFAMETRO students as part of a curricular extension project.
- The existing product content and interface are in Brazilian Portuguese.

## Evidence on Hand

- Product description and operational documentation: [README.md](./README.md).
- Application source: [src/app.html](./src/app.html), built into [public/index.html](./public/index.html).
- Server-side capabilities and configuration: [server.js](./server.js).
- No user research, outcome metrics, testimonials, or independently verified impact evidence were provided. Do not invent these claims.

## Product Principles

- Help students turn career goals into activities they can organize and track.
- Put relevant opportunities and university support alongside individual planning.
- Keep student and coordination workflows distinct while making them work together.
- Handle personal and career-planning information with care and make reporting boundaries clear.
- Describe intended benefits without presenting unverified outcomes as proven results.
