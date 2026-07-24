# Logout account trigger contract v2

The account-menu logout control and the sidebar game-session logout control must both enter the same owned confirmation surface.

The trigger bridge runs before the hardened logout transport controller and recognizes logout intent from controlled action metadata, data attributes, element identifiers, accessibility labels, titles, or visible text. It must not intercept controls inside the owned confirmation surface.

Confirmed logout delegates to the hardened transport controller. Cancel leaves the authenticated session and selected game unchanged.
