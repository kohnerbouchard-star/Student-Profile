-- Default Eco Novaria stock templates V1.
-- Seeds fictional, inactive-market-safe company templates only. This migration
-- does not create runtime game assets, trades, portfolios, orders, fills,
-- reservations, ledger writes, schedulers, real companies, or real market data.

insert into public.stock_templates (
  ticker,
  company_name,
  sector_key,
  country_code,
  description,
  base_price,
  beta,
  liquidity,
  long_run_volatility,
  shares_outstanding,
  fundamentals,
  country_exposure,
  sector_exposure,
  commodity_exposure,
  is_active
)
values
  ('FGRM', 'Frostgate Rare Minerals', 'RARE_MINERALS', 'NORTHREACH', 'Northreach rare-minerals producer serving technology and defense supply chains.', 84.00, 1.22, 0.72, 0.052000, 1800000, '{"revenueGrowth":0.07,"profitMargin":0.16,"debtLevel":0.32,"cashReserves":0.58,"innovationScore":0.42,"supplyChainRisk":0.48,"politicalExposure":0.38,"commodityExposure":0.82}'::jsonb, '{"NORTHREACH":1}'::jsonb, '{"RARE_MINERALS":0.72,"ENERGY":0.16}'::jsonb, '{"MINERALS":0.86,"FUEL":0.12}'::jsonb, true),
  ('NRGE', 'Northreach Grid Energy', 'ENERGY', 'NORTHREACH', 'Cold-region energy operator with exposure to extraction sites and grid reliability.', 58.50, 1.05, 0.78, 0.041000, 2200000, '{"revenueGrowth":0.04,"profitMargin":0.12,"debtLevel":0.44,"cashReserves":0.46,"innovationScore":0.38,"supplyChainRisk":0.34,"politicalExposure":0.32,"commodityExposure":0.64}'::jsonb, '{"NORTHREACH":1}'::jsonb, '{"ENERGY":0.8,"INFRASTRUCTURE":0.2}'::jsonb, '{"FUEL":0.7,"METALS":0.12}'::jsonb, true),
  ('SBLC', 'Sableport Line Carriers', 'SHIPPING_LOGISTICS', 'YRETHIA', 'Yrethian container and port logistics carrier tied to regulated maritime trade.', 46.75, 0.96, 0.84, 0.034000, 2600000, '{"revenueGrowth":0.035,"profitMargin":0.09,"debtLevel":0.38,"cashReserves":0.5,"innovationScore":0.35,"supplyChainRisk":0.42,"politicalExposure":0.2,"commodityExposure":0.28}'::jsonb, '{"YRETHIA":1}'::jsonb, '{"SHIPPING_LOGISTICS":0.82,"FINANCE_INSURANCE":0.12}'::jsonb, '{"FUEL":0.36}'::jsonb, true),
  ('YFIN', 'Yrethia Freight Assurance', 'FINANCE_INSURANCE', 'YRETHIA', 'Freight finance and insurance firm underwriting Sableport maritime commerce.', 63.20, 0.88, 0.81, 0.030000, 1400000, '{"revenueGrowth":0.045,"profitMargin":0.18,"debtLevel":0.26,"cashReserves":0.64,"innovationScore":0.44,"supplyChainRisk":0.24,"politicalExposure":0.18,"commodityExposure":0.12}'::jsonb, '{"YRETHIA":1}'::jsonb, '{"FINANCE_INSURANCE":0.76,"SHIPPING_LOGISTICS":0.28}'::jsonb, '{"FUEL":0.08}'::jsonb, true),
  ('DHRE', 'Dusk Harbor Re-Export', 'REPAIR_SALVAGE_RE_EXPORT_TRADE', 'THALORIS', 'Thalorian re-export and customs logistics operator for high-risk cargo routes.', 35.40, 1.34, 0.58, 0.061000, 1900000, '{"revenueGrowth":0.06,"profitMargin":0.08,"debtLevel":0.5,"cashReserves":0.34,"innovationScore":0.3,"supplyChainRisk":0.7,"politicalExposure":0.62,"commodityExposure":0.24}'::jsonb, '{"THALORIS":1}'::jsonb, '{"REPAIR_SALVAGE_RE_EXPORT_TRADE":0.72,"SHIPPING_LOGISTICS":0.42}'::jsonb, '{"FUEL":0.22,"METALS":0.18}'::jsonb, true),
  ('THSV', 'Thaloris Salvage Works', 'REPAIR_SALVAGE_RE_EXPORT_TRADE', 'THALORIS', 'Marine repair and salvage yards serving disrupted trade corridors.', 29.85, 1.28, 0.52, 0.066000, 1700000, '{"revenueGrowth":0.035,"profitMargin":0.1,"debtLevel":0.42,"cashReserves":0.36,"innovationScore":0.28,"supplyChainRisk":0.66,"politicalExposure":0.58,"commodityExposure":0.4}'::jsonb, '{"THALORIS":1}'::jsonb, '{"REPAIR_SALVAGE_RE_EXPORT_TRADE":0.84,"HEAVY_INDUSTRY_MANUFACTURING":0.18}'::jsonb, '{"METALS":0.46,"FUEL":0.26}'::jsonb, true),
  ('AURA', 'Aurora Aerospace Systems', 'AI_AEROSPACE', 'SOLVEND', 'Solvend aerospace and AI systems manufacturer built around Aurora Spire research capacity.', 112.00, 1.18, 0.76, 0.048000, 1300000, '{"revenueGrowth":0.11,"profitMargin":0.15,"debtLevel":0.24,"cashReserves":0.68,"innovationScore":0.88,"supplyChainRisk":0.36,"politicalExposure":0.22,"commodityExposure":0.2}'::jsonb, '{"SOLVEND":1}'::jsonb, '{"AI_AEROSPACE":0.8,"TECHNOLOGY":0.5}'::jsonb, '{"RARE_COMPONENTS":0.34}'::jsonb, true),
  ('SPRE', 'Spire Research Engines', 'AI_AEROSPACE', 'SOLVEND', 'Precision research and compute systems firm supplying technical education and aerospace labs.', 74.25, 1.12, 0.74, 0.044000, 1600000, '{"revenueGrowth":0.09,"profitMargin":0.13,"debtLevel":0.2,"cashReserves":0.72,"innovationScore":0.92,"supplyChainRisk":0.3,"politicalExposure":0.16,"commodityExposure":0.14}'::jsonb, '{"SOLVEND":1}'::jsonb, '{"AI_AEROSPACE":0.58,"TECHNOLOGY":0.62,"EDUCATION_MEDIA_DIPLOMACY":0.12}'::jsonb, '{"RARE_COMPONENTS":0.28}'::jsonb, true),
  ('CRAG', 'Crescent Bay Agriculture', 'AGRICULTURE_COMMODITIES', 'ELDORAN', 'Eldoran agricultural producer tied to food security and regional commodities.', 41.10, 0.74, 0.86, 0.026000, 3100000, '{"revenueGrowth":0.025,"profitMargin":0.11,"debtLevel":0.28,"cashReserves":0.52,"innovationScore":0.36,"supplyChainRisk":0.32,"politicalExposure":0.14,"commodityExposure":0.58}'::jsonb, '{"ELDORAN":1}'::jsonb, '{"AGRICULTURE_COMMODITIES":0.84,"FOOD_SECURITY":0.38}'::jsonb, '{"GRAIN":0.7,"FUEL":0.12}'::jsonb, true),
  ('EDFS', 'Eldoran Food Security', 'FOOD_SECURITY', 'ELDORAN', 'Food storage and distribution company supporting Crescent Bay supply stability.', 38.80, 0.68, 0.82, 0.024000, 2800000, '{"revenueGrowth":0.03,"profitMargin":0.1,"debtLevel":0.22,"cashReserves":0.56,"innovationScore":0.34,"supplyChainRisk":0.26,"politicalExposure":0.12,"commodityExposure":0.42}'::jsonb, '{"ELDORAN":1}'::jsonb, '{"FOOD_SECURITY":0.78,"SHIPPING_LOGISTICS":0.18}'::jsonb, '{"GRAIN":0.58,"FUEL":0.1}'::jsonb, true),
  ('GLWT', 'Glassfall Water Infrastructure', 'INFRASTRUCTURE', 'VALERION', 'Valerion water infrastructure operator serving clean-tech industrial districts.', 69.60, 0.82, 0.79, 0.029000, 1500000, '{"revenueGrowth":0.04,"profitMargin":0.14,"debtLevel":0.34,"cashReserves":0.6,"innovationScore":0.54,"supplyChainRisk":0.22,"politicalExposure":0.16,"commodityExposure":0.16}'::jsonb, '{"VALERION":1}'::jsonb, '{"INFRASTRUCTURE":0.72,"CLEAN_ENERGY":0.22}'::jsonb, '{"WATER":0.8,"METALS":0.12}'::jsonb, true),
  ('VCLR', 'Valerion Clean Grid', 'CLEAN_ENERGY', 'VALERION', 'Clean energy grid company linked to premium manufacturing and capital-intensive utilities.', 88.40, 0.94, 0.8, 0.033000, 1700000, '{"revenueGrowth":0.055,"profitMargin":0.13,"debtLevel":0.36,"cashReserves":0.62,"innovationScore":0.68,"supplyChainRisk":0.24,"politicalExposure":0.18,"commodityExposure":0.2}'::jsonb, '{"VALERION":1}'::jsonb, '{"CLEAN_ENERGY":0.82,"INFRASTRUCTURE":0.34}'::jsonb, '{"METALS":0.2,"WATER":0.18}'::jsonb, true),
  ('STED', 'Starfall Education Media', 'EDUCATION_MEDIA_DIPLOMACY', 'LUMENOR', 'Lumenor education and media network serving civic instruction and public information.', 52.30, 0.62, 0.75, 0.022000, 1200000, '{"revenueGrowth":0.028,"profitMargin":0.12,"debtLevel":0.18,"cashReserves":0.66,"innovationScore":0.52,"supplyChainRisk":0.14,"politicalExposure":0.2,"commodityExposure":0.04}'::jsonb, '{"LUMENOR":1}'::jsonb, '{"EDUCATION_MEDIA_DIPLOMACY":0.86,"TECHNOLOGY":0.14}'::jsonb, '{}'::jsonb, true),
  ('LMED', 'Lumenor Civic Media', 'EDUCATION_MEDIA_DIPLOMACY', 'LUMENOR', 'Public-service media and diplomacy contractor with stability-sensitive demand.', 47.90, 0.58, 0.72, 0.021000, 1150000, '{"revenueGrowth":0.02,"profitMargin":0.11,"debtLevel":0.16,"cashReserves":0.7,"innovationScore":0.48,"supplyChainRisk":0.12,"politicalExposure":0.22,"commodityExposure":0.03}'::jsonb, '{"LUMENOR":1}'::jsonb, '{"EDUCATION_MEDIA_DIPLOMACY":0.78,"FINANCE_INSURANCE":0.08}'::jsonb, '{}'::jsonb, true),
  ('BLCY', 'Blacklight Cyber Systems', 'CYBERSECURITY_FINTECH_DATA', 'SYNDALIS', 'Syndalis cybersecurity systems firm serving finance and critical data infrastructure.', 96.75, 1.26, 0.7, 0.057000, 1250000, '{"revenueGrowth":0.1,"profitMargin":0.17,"debtLevel":0.22,"cashReserves":0.62,"innovationScore":0.86,"supplyChainRisk":0.32,"politicalExposure":0.54,"commodityExposure":0.08}'::jsonb, '{"SYNDALIS":1}'::jsonb, '{"CYBERSECURITY_FINTECH_DATA":0.84,"TECHNOLOGY":0.42}'::jsonb, '{"POWER":0.16}'::jsonb, true),
  ('SYDC', 'Syndalis Data Centers', 'CYBERSECURITY_FINTECH_DATA', 'SYNDALIS', 'Energy-intensive data infrastructure operator for fintech and secure compute workloads.', 71.35, 1.14, 0.67, 0.052000, 1550000, '{"revenueGrowth":0.08,"profitMargin":0.14,"debtLevel":0.4,"cashReserves":0.48,"innovationScore":0.7,"supplyChainRisk":0.38,"politicalExposure":0.5,"commodityExposure":0.18}'::jsonb, '{"SYNDALIS":1}'::jsonb, '{"CYBERSECURITY_FINTECH_DATA":0.68,"INFRASTRUCTURE":0.28}'::jsonb, '{"POWER":0.42,"METALS":0.08}'::jsonb, true),
  ('EMBK', 'Emberhall Banking Group', 'BANKING_INFRASTRUCTURE_FINANCE', 'XALVORIA', 'Xalvoria banking group financing infrastructure and capital-heavy industry.', 67.15, 1.08, 0.82, 0.038000, 2100000, '{"revenueGrowth":0.045,"profitMargin":0.19,"debtLevel":0.3,"cashReserves":0.74,"innovationScore":0.4,"supplyChainRisk":0.2,"politicalExposure":0.46,"commodityExposure":0.1}'::jsonb, '{"XALVORIA":1}'::jsonb, '{"BANKING_INFRASTRUCTURE_FINANCE":0.82,"FINANCE_INSURANCE":0.46}'::jsonb, '{}'::jsonb, true),
  ('XFIN', 'Xalvoria Infrastructure Finance', 'BANKING_INFRASTRUCTURE_FINANCE', 'XALVORIA', 'Infrastructure finance company exposed to public works, banking flows, and capital influence.', 73.55, 1.1, 0.78, 0.041000, 1650000, '{"revenueGrowth":0.05,"profitMargin":0.17,"debtLevel":0.42,"cashReserves":0.62,"innovationScore":0.38,"supplyChainRisk":0.22,"politicalExposure":0.5,"commodityExposure":0.12}'::jsonb, '{"XALVORIA":1}'::jsonb, '{"BANKING_INFRASTRUCTURE_FINANCE":0.74,"INFRASTRUCTURE":0.34}'::jsonb, '{"METALS":0.08}'::jsonb, true),
  ('IRST', 'Ironhold Steel Works', 'HEAVY_INDUSTRY_MANUFACTURING', 'DRAVENLOK', 'Dravenlok steel producer supplying machinery and defense manufacturing.', 49.95, 1.2, 0.64, 0.055000, 2400000, '{"revenueGrowth":0.04,"profitMargin":0.09,"debtLevel":0.48,"cashReserves":0.4,"innovationScore":0.32,"supplyChainRisk":0.52,"politicalExposure":0.56,"commodityExposure":0.74}'::jsonb, '{"DRAVENLOK":1}'::jsonb, '{"HEAVY_INDUSTRY_MANUFACTURING":0.86,"DEFENSE_SECURITY":0.28}'::jsonb, '{"STEEL":0.78,"FUEL":0.28}'::jsonb, true),
  ('DVMX', 'Dravenlok Machinery Exchange', 'HEAVY_INDUSTRY_MANUFACTURING', 'DRAVENLOK', 'Machinery and heavy logistics manufacturer tied to defense and industrial demand.', 44.60, 1.16, 0.62, 0.052000, 2050000, '{"revenueGrowth":0.035,"profitMargin":0.1,"debtLevel":0.44,"cashReserves":0.42,"innovationScore":0.36,"supplyChainRisk":0.48,"politicalExposure":0.52,"commodityExposure":0.58}'::jsonb, '{"DRAVENLOK":1}'::jsonb, '{"HEAVY_INDUSTRY_MANUFACTURING":0.78,"SHIPPING_LOGISTICS":0.14}'::jsonb, '{"STEEL":0.62,"FUEL":0.24}'::jsonb, true)
on conflict ((lower(ticker))) do update
set
  company_name = excluded.company_name,
  sector_key = excluded.sector_key,
  country_code = excluded.country_code,
  description = excluded.description,
  base_price = excluded.base_price,
  beta = excluded.beta,
  liquidity = excluded.liquidity,
  long_run_volatility = excluded.long_run_volatility,
  shares_outstanding = excluded.shares_outstanding,
  fundamentals = excluded.fundamentals,
  country_exposure = excluded.country_exposure,
  sector_exposure = excluded.sector_exposure,
  commodity_exposure = excluded.commodity_exposure,
  is_active = excluded.is_active;
