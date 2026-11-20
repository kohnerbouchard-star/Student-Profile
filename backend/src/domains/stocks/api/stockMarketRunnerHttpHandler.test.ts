import "../infrastructure/runtimeCursorStockMarketRepositories.test.ts";
import "../calculations/stockMarketEngine.test.ts";
import "../../storylines/server/stockTickStorylineRunner.test.ts";
// Register each cohesive case group once, preserving the original test order.
import "./stockMarketRunnerHttpHandler.test.authorizationAndPublication.cases.ts";
import "./stockMarketRunnerHttpHandler.test.storyHooks.cases.ts";
import "./stockMarketRunnerHttpHandler.test.tickApplication.cases.ts";
import "./stockMarketRunnerHttpHandler.test.realtimeBoundary.cases.ts";
