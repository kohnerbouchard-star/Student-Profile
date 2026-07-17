# Econovaria Player Terminal — UX Research and Decisions

## Objective

Reduce navigation burden and make the player’s core economic loop obvious without removing the simulation systems already implemented.

## Research basis

The redesign uses four established principles:

1. **Progressive disclosure:** show the most important action first and defer advanced or infrequent controls until requested. Source: Nielsen Norman Group, *Progressive Disclosure*.
2. **Recognition, status, and error prevention:** keep location, account state, active section, and pending API behavior visible. Source: Nielsen Norman Group, *10 Usability Heuristics for User Interface Design*.
3. **Start with user needs and do the hard work to make it simple:** organize the terminal around player tasks rather than backend modules. Source: GOV.UK, *Government Design Principles*.
4. **Visible and unobscured keyboard focus:** provide a strong focus indicator and ensure fixed navigation does not conceal the end of the page. Sources: W3C WCAG, *Focus Visible* and *Focus Not Obscured*.

## Primary usability problems found in v5

- Fifteen equal-weight destinations created excessive choice at every navigation decision.
- Mobile navigation compressed all destinations into one long horizontal strip.
- The dashboard presented identity, wealth, contracts, intelligence, service shortcuts, market data, and national metrics at the same visual priority.
- Secondary actions such as hiring, player transfers, loan applications, repayments, and marketplace listing creation were permanently expanded.
- Page structure followed system categories more than the player’s immediate decisions.
- Small target sizes and inconsistent focus treatments reduced accessibility and precision.

## Implemented information architecture

The fifteen routes remain available but are grouped into seven primary sections:

- Home
- World
- Finance
- Work
- Trade
- Messages
- Profile

Desktop uses a grouped sidebar and an in-section submenu. Mobile uses five persistent destinations—Home, Finance, Work, Trade, and More—with a bottom sheet for World, Messages, Account, and Progression.

## Implemented core flow

The new dashboard is a command center rather than a directory. It presents:

1. Available cash, net worth, active contracts, and unread communications.
2. Three ordered next actions.
3. A simplified interactive world map.
4. Current world signals.
5. A compact financial snapshot.

## Progressive disclosure

The following secondary actions are now collapsed until the player requests them:

- Hiring an employee
- Sending money to another player
- Creating a marketplace listing
- Applying for a loan
- Making a loan payment

Production and internal transfers remain initially open because they are the primary actions on their respective pages.

## Accessibility and responsive behavior

- Added a skip link.
- Added a consistent high-contrast `:focus-visible` treatment.
- Increased primary interactive targets to approximately 44 pixels.
- Reserved page space above the fixed mobile navigation.
- Added reduced-motion handling.
- Verified document width at 1440 × 1000 and 390 × 844 across all fifteen routes.
