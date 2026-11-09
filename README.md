# Udemy Complete All Lectures

One click marks every remaining lecture, quiz and lab in a Udemy course as complete — without
watching or downloading anything.

## How it works

On any `/course/{slug}` or `/course/{slug}/learn/…` page (also `tcsglobal.udemy.com`), a small
floating card appears at the bottom-left with a **Mark all complete** button. Clicking it:

1. Resolves the course's numeric id from the slug.
2. Pulls the full curriculum list (`subscriber-curriculum-items`) — lectures, quizzes, practice
   and lab items.
3. Reads your progress (`subscribed-courses/{id}/progress`) to skip what's already done.
4. Marks each remaining item complete through the same POST endpoints the course UI itself uses
   (`completed-lectures/`, `completed-quizzes/`, …), at a human-ish 350–900 ms cadence.
5. Re-reads progress and reports `X/Y complete`.

No external services, no video seeking, no adblock interaction. It only calls APIs your
browser is already authorised to call on your own enrolled courses.

## Limits

- Works on courses you are **enrolled** in (the completion endpoints belong to
  `users/me/subscribed-courses/`).
- Marking complete is a real, server-side state change: it counts towards course progress and
  certificate eligibility. Use it on courses you intend to finish.

## Open Knowledge Format

See [okf/](okf/) for the self-describing bundle: architecture, testing rules, and this script's notes.

