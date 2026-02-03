import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initBot } from "../src/bot/index.js";
import { createLogger } from "../src/lib/logger.js";

const log = createLogger({ handler: "webhook" });

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    log.warn("Non-POST request to webhook", { method: req.method });
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const updateType = req.body?.message ? "message" :
                       req.body?.callback_query ? "callback_query" :
                       req.body?.pre_checkout_query ? "pre_checkout_query" :
                       req.body?.successful_payment ? "successful_payment" : "unknown";

    log.debug("Received webhook update", {
      updateType,
      updateId: req.body?.update_id,
      fromId: req.body?.message?.from?.id || req.body?.callback_query?.from?.id,
    });

    const bot = await initBot();
    await bot.handleUpdate(req.body);

    log.debug("Webhook update processed successfully", {
      updateId: req.body?.update_id,
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    log.error("Webhook processing failed", {
      updateId: req.body?.update_id,
    }, error);
    res.status(500).json({ error: "Internal server error" });
  }
}
