


import { createAdminApiClient } from "./api/admin-api-client.js";

import { createContractsApiClient } from "./api/contracts-api-client.js";


import { createAdminInventoryRedemptionQueueClient } from "../../inventory-redemption-queue-client.js";
import { createAttendanceApi } from "./routes/attendance/AttendanceApi.js";
import { createAttendanceController } from "./routes/attendance/AttendanceController.js";
import { createBankingApiClient } from "./routes/banking/BankingApi.js";
import { createBankingController } from "./routes/banking/BankingController.js";
import { createContractsController } from "./routes/contracts/ContractsController.js";
import { createInventoryController } from "./routes/inventory/InventoryController.js";
import { createLoansApiClient } from "./routes/loans/LoansApiClient.js";
import { createLoansController } from "./routes/loans/LoansController.js";
import { createLogsApiClient } from "./routes/logs/LogsApi.js";
import { createLogsController } from "./routes/logs/LogsController.js";
import { createMarketController } from "./routes/market/MarketController.js";
import { createCraftingApiClient } from "./routes/crafting/CraftingApi.js";
import { createCraftingController } from "./routes/crafting/CraftingController.js";
import { createBusinessApi } from "./routes/business/BusinessApi.js";
import { createBusinessController } from "./routes/business/BusinessController.js";
import { createMarketplaceApiClient } from "./routes/marketplace/MarketplaceApiClient.js";
import { createMarketplaceController } from "./routes/marketplace/MarketplaceController.js";
import { createMessagesAdminClient } from "./routes/messages/MessagesApi.js";
import { createMessagesController } from "./routes/messages/MessagesController.js";
import { createNewsEventsApi } from "./routes/news-events/NewsEventsApi.js";
import { createNewsEventsController } from "./routes/news-events/NewsEventsController.js";
import { createOverviewController } from "./routes/overview/OverviewController.js";
import { createPlayersController } from "./routes/players/PlayersController.js";
import { createProgressionApiClient } from "./routes/progression/ProgressionClient.js";
import { createProgressionController } from "./routes/progression/ProgressionController.js";
import { createSettingsApi } from "./routes/settings/SettingsApi.js";
import { createSettingsController } from "./routes/settings/SettingsController.js";
import { createStoreController } from "./routes/store/StoreController.js";
import { createWorldManagementController } from "./routes/world-management/WorldManagementController.js";

export function createAppControllers({ transport, selectedGameId, hasPermission, renderOverviewChange, updateOverviewShell, renderControllerChange, notify }) {
  const api = createAdminApiClient({ fetchImpl: transport });
  const attendanceApi = createAttendanceApi({ fetchImpl: transport });
  const bankingApi = createBankingApiClient({ fetchImpl: transport });
  const contractsApi = createContractsApiClient({ fetchImpl: transport });
  const inventoryApi = createAdminInventoryRedemptionQueueClient({ fetchImpl: transport });
  const craftingApi = createCraftingApiClient({ fetchImpl: transport });
  const businessApi = createBusinessApi({ fetchImpl: transport });
  const marketplaceApi = createMarketplaceApiClient({ fetchImpl: transport });
  const loansApi = createLoansApiClient({ fetchImpl: transport });
  const logsApi = createLogsApiClient({ fetchImpl: transport });
  const messagesApi = createMessagesAdminClient({ fetchImpl: transport });
  const newsEventsApi = createNewsEventsApi({ fetchImpl: transport });
  const progressionApi = createProgressionApiClient({ fetchImpl: transport });
  const settingsApi = createSettingsApi({ fetchImpl: transport });
  const overview = createOverviewController({
    api,
    selectedGameId,
    hasPermission,
    onChange: renderOverviewChange,
    onResolved: updateOverviewShell,
  });
  const attendance = createAttendanceController({
    api: attendanceApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("attendance"),
    notify: notify,
  });
  const store = createStoreController({
    api,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("store"),
    notify: notify,
  });
  const inventory = createInventoryController({
    api: inventoryApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("inventory"),
    notify: notify,
  });
  const market = createMarketController({
    api,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("market"),
  });
  const business = createBusinessController({
    api: businessApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("business"),
    notify: notify,
  });
  const crafting = createCraftingController({
    api: craftingApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("crafting"),
    notify: notify,
  });
  const marketplace = createMarketplaceController({
    api: marketplaceApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("marketplace"),
    notify: notify,
  });
  const banking = createBankingController({
    api: bankingApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("banking"),
    notify: notify,
  });
  const loans = createLoansController({
    api: loansApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("loans"),
  });
  const players = createPlayersController({
    api,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("players"),
    notify: notify,
  });
  const contracts = createContractsController({
    api: contractsApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("contracts"),
    notify: notify,
  });
  const worldManagement = createWorldManagementController({
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("world-management"),
    notify: notify,
  });
  const newsEvents = createNewsEventsController({
    api: newsEventsApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("news-events"),
    notify: notify,
  });
  const messages = createMessagesController({
    api: messagesApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("messages"),
    notify: notify,
  });
  const progression = createProgressionController({
    api: progressionApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("progression"),
    notify: notify,
  });
  const settings = createSettingsController({
    api: settingsApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("settings"),
    notify: notify,
  });
  const logs = createLogsController({
    api: logsApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("logs"),
  });
  return {
    overview, attendance, store, inventory, market, business, crafting, marketplace, banking, loans,
    players, contracts, worldManagement, newsEvents, messages, progression, settings, logs,
  };
}
