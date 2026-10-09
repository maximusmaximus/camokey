# UX lock questions

Answer yes or no. Defaults in parentheses are what we will ship if you skip one.

1. First screen is the full-screen camo, not a login form? (yes)
2. Walkthrough starts automatically the first time only? (yes)
3. Walkthrough uses plain words a 12-year-old can follow? (yes)
4. Each step is one sentence plus one button? (yes)
5. Desktop "i" reopens the same walkthrough? (yes)
6. Mobile gets the same "i"? (yes)
7. Tour is keyboard-only usable? (yes)
8. Tour traps focus and restores it on close? (yes)
9. Escape closes the tour? (yes)
10. Tour respects reduced motion? (yes)
11. Random changes the whole screen instantly? (yes)
12. Random keeps the last pattern if generation fails? (yes)
13. The pattern on screen is the exact pattern that will be exported? (yes)
14. Use this freezes that pattern before export? (yes)
15. Random stays available after Use this, as a new draft? (yes)
16. User names the set before export? (yes)
17. A set is many copies of the same camo with different serials? (yes)
18. Each serial in a set gets its own public/private/unlisted choice? (yes)
19. Default visibility is private? (yes)
20. Public is explained as "anyone who scans can read this"? (yes)
21. Private is explained as "scan shows the id, needs a code"? (yes)
22. Unlisted is explained as "not in the list, works with the link"? (yes)
23. Item code is typed twice? (yes)
24. A weak code is rejected in plain language? (yes)
25. Export downloads a PNG of the full-screen camo? (yes)
26. Export also downloads a text list of serials and names? (yes)
27. User sees a preview of the print sheet before download? (yes)
28. Site works with no account server? (yes)
29. Login is the BIP39 mnemonic, after the first camo, not before? (yes)
30. We warn that a lost mnemonic cannot be recovered? (yes)
31. Mnemonic is shown once, with an "I wrote it down" check? (yes)
32. Buttons are at least 44px on touch? (yes)
33. Text meets WCAG AA contrast on the camo overlay? (yes)
34. Controls sit on a solid bar, not on the camo? (yes)
35. Camo fills the viewport including mobile browser chrome? (yes)
36. Landscape and portrait are both tested? (yes)
37. We support 320px wide phones? (yes)
38. We support a 1920px desktop? (yes)
39. UI is light-on-dark only, to sit on camo? (yes)
40. There is a high-contrast mode? (yes)
41. Screen readers announce "new pattern ready" after Random? (yes)
42. Errors say what to do, not a code? (yes)
43. Walkthrough is skippable? (yes)
44. Skipped users still have the "i"? (yes)
45. Site remembers that the tour was finished? (yes)
46. We avoid asking for email? (yes)
47. We avoid cookies except the tour-seen flag? (yes)
48. Export works offline after the page loads? (yes)
49. First walkthrough mentions that a photo of the cloth can be copied? (yes)
50. We ship the site from this public repo on GitHub Pages? (yes)

## Tooling

- UI: Vite + canvas 2d. https://vitejs.dev
- Tour: custom dialog, keyboard, focus trap, reduced motion.
- E2E: Playwright projects at 320, 390, 768, 1280, 1920. https://playwright.dev
- A11y: axe-core in those tests. https://github.com/dequelabs/axe-core
- Host: GitHub Pages. https://pages.github.com
