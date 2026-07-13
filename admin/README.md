# Eco Novaria admin frontend replacement

This directory is the v606 administrator frontend integrated into the Student-Profile repository.

- `/index.html` remains the existing student/player frontend.
- `/admin/index.html` owns staff sign-in, Create Game, game selection, and the v606 admin terminal.
- The frontend authenticates through Supabase Auth and uses the existing `classroom-api` Edge Function.
- A browser-side compatibility bridge maps the v606 session bootstrap and currently available Student-Profile admin routes. Unimplemented v606 routes fail closed with HTTP 501 rather than using demo data.
- The fixed 15-minute v606 admin inactivity policy remains enabled.

The embedded asset form is intentional: the GitHub connector used for this replacement can write UTF-8 repository files but cannot upload binary media. All required images and one shared motion background are embedded as data URIs so the repository build remains self-contained.
