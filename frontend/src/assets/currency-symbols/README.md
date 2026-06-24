# Econovaria Currency Symbols

This folder contains SVG currency symbols for the official Econovaria country currencies.

The database should use `currencies.symbol_key` to select the SVG asset. The `currencies.symbol` field is only a short fallback label when SVG rendering is unavailable.

## Mapping

| Currency Code | Country | Currency Name | Symbol Key | SVG Asset |
|---|---|---|---|---|
| NRC | NORTHREACH | Northreach Credit | saturn | `saturn.svg` |
| YRC | YRETHIA | Yrethian Crown | neptune | `neptune.svg` |
| THD | THALORIS | Thaloris Dinar | arsenic | `arsenic.svg` |
| SLV | SOLVEND | Solvend Volt | jupiter | `jupiter.svg` |
| ELD | ELDORAN | Eldoran Ducat | alumen | `alumen.svg` |
| VAL | VALERION | Valerion Lira | gold | `gold.svg` |
| LUM | LUMENOR | Lumenor Mark | lapis_lazuli | `lapis_lazuli.svg` |
| SYN | SYNDALIS | Syndalis Note | alcali | `alcali.svg` |
| XAL | XALVORIA | Xalvorian Lira | lead | `lead.svg` |
| DRV | DRAVENLOK | Dravenlok Vek | ferrum | `ferrum.svg` |

SVGs use `currentColor`, so the UI can color them through CSS.
