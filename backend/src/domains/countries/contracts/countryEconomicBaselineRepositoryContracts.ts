import type {
  GameCountryEconomicBaselineSettingsRecord,
  GetGameCountryEconomicBaselineSettingsInput,
} from "./countryEconomicBaselineTypes.ts";
import type { SaveGameCountryEconomicBaselineSettingsInput } from "./countryEconomicBaselineSaveInput.ts";

export interface CountryEconomicBaselineRepository {
  getGameCountryEconomicBaselineSettings(
    input: GetGameCountryEconomicBaselineSettingsInput,
  ): Promise<GameCountryEconomicBaselineSettingsRecord | null>;

  saveGameCountryEconomicBaselineSettings(
    input: SaveGameCountryEconomicBaselineSettingsInput,
  ): Promise<GameCountryEconomicBaselineSettingsRecord>;
}
