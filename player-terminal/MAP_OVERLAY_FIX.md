# Map Overlay Fix — v7.3

## Defect

The dashboard map rendered a full-width `Home Market` summary card inside the bottom of the map. The card obscured southern countries and always displayed the authenticated player’s home country, so it did not reflect the country under interaction.

## Correction

- Removed the persistent country summary from the map markup.
- Kept the home-country identity in the map-panel header, where it does not cover geography.
- Added a compact, non-interactive instruction chip in the upper-left corner.
- Preserved all ten clickable border regions.
- Country-specific information continues to open in the existing country-intelligence modal.
- No API, session adapter, page routing, icon, or underlying v7 stylesheet changes were made.
