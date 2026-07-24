# Admin logout real-control regression

The original sign-out repair validated the replacement confirmation against the new sidebar session card. The reported failure originated from the existing top-right account menu, whose logout control can expose a longer action or accessibility label and was not exercised by that test.

This repair adds a pre-controller capture bridge that recognizes logout intent across action, data, id, accessibility-label, title and visible-text signals. The bridge delegates to the owned confirmation surface before the hardened logout controller or the legacy terminal bundle can consume the event.

The browser contract now opens the real account menu, inventories its rendered controls, clicks the actual logout control, rejects any simultaneously visible legacy modal, and verifies bounded geometry, account/game/code binding, Cancel behavior, Auth revocation, local cleanup and redirect.
