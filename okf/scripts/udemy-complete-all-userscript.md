---
type: Script
title: Udemy Complete All Lectures
description: One-click course completion for Udemy and TCS Global Udemy via the app's own completion API, with a DOM fallback for quizzes.
tags: [userscript, udemy, lms, completion, gray-ethics]
timestamp: 2026-11-09T00:00:00Z
---

# udemy-complete-all-userscript

One click marks every remaining lecture, quiz, practice and lab in a Udemy course
complete, using the same POST endpoints the course UI itself uses.

## Mechanism (verified 2026-11-09)

- **Course id**: the numeric id is cached in `localStorage` (`ucav_course_id_{slug}`)
  from the **public** course page, where `GET /api-2.0/courses/{slug}/` is anonymous.
  On `/learn/` pages that call is bot-walled (403), so it is never attempted there.
- **Curriculum**: `GET /api-2.0/courses/{id}/subscriber-curriculum-items/?curriculum_types=chapter,lecture,practice,quiz,role-play,graded-lab,graded-role-play&page_size=200`
- **Progress**: `GET /api-2.0/users/me/subscribed-courses/{id}/progress/?fields[course]=completed_lecture_ids,completed_quiz_ids,...`
- **Lectures**: `POST .../completed-lectures/` `{lecture_id, downloaded:false}` → 201
- **Quizzes**: no REST endpoint exists (`/completed-quizzes/` 404s). The UI's checkbox
  writes completion through a client-side channel, so the script clicks the DOM
  checkbox. Its completion-state span is a **sibling** of the label
  (`#item-completion-state-{id}` → parent → `label` → `input`), not its descendant.
- **Cadence**: 350–900 ms jitter between requests.
- **Verified**: 53/53 on `course/automate` (51 lectures via API + 2 quizzes via DOM
  toggle), re-verified after each run.

## Gray-ethics note

Marking complete is a real, server-side state change that counts towards progress and
certificate eligibility. The script is in scope for this collection's anti-bot/LMS
category but the user should only run it on courses they intend to finish.

## Untested

`tcsglobal.udemy.com` — the domain redirects to TCS SSO (`auth.ultimatix.net`) before
any course content loads, so the API flow could not be verified from a non-corporate
network. The identical endpoints are expected to apply; treat TCS Global as untested.
