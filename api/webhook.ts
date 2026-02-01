import { webhookCallback } from "grammy";
import { getBot } from "../src/bot/index.js";

export default webhookCallback(getBot(), "std/http");
