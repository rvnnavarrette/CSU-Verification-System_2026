# Login Page Audit Notes — Session 1

## Current State Summary
- Split panel: Left = hero with campus photo + dark overlay, Right = login form on light gray bg
- Left panel: Logo, "FAST • SECURE • OFFICIAL" yellow text, large white headline, subtext, 3 ghost CTA buttons
- Right panel: White card, "Sign in to continue" title, Sign In / Create Account tabs, email + password fields, large green Sign In button, "or" divider, "Admin access" shield link, footer

## Critical Issues
1. THREE CTA buttons in hero = paradox of choice, dilutes form CTA focus — REMOVE THEM
2. Card-on-gray-background = low contrast, looks flat — use full-bleed white or proper shadow
3. Input focus rings likely browser-default blue — must be brand green
4. Dark overlay is flat single-tone — needs gradient to bleed green in

## Priority Fix Order
### P1 (Critical)
- Remove 3 hero CTA buttons, add trust strip (CHED accreditation, SSL, request count)
- Fix right panel: full-bleed white or proper card shadow on #F8FAFC
- Fix input focus states to brand green
- Unify to Inter font

### P2 (High)
- Add gradient overlay: `linear-gradient(135deg, rgba(13,17,23,0.85), rgba(27,94,32,0.65))`
- Add green-tinted shadow to Sign In button
- Tab styling: underline-active, not box-style
- Vertically center form content in right panel
- Upgrade "Admin access" to outlined secondary button

### P3 (Polish)
- Loading state on Sign In button ("Signing in..." + spinner)
- Entrance animation: opacity + translateY 300ms ease-out
- 3px green accent bar at top of right panel
- Footer: separator line, center-aligned, #94A3B8

## Copywriting Fixes
- Subtitle "Enter your credentials to access your account" is redundant — replace with trust copy
- "FAST • SECURE • OFFICIAL" separator — change bullet to " | " with spacing
