/**
 * Integration test for 3x-ui API client
 *
 * Usage:
 *   XUI_HOST=your-server.com XUI_PORT=2053 XUI_USER=admin XUI_PASS=xxx INBOUND_ID=1 npx tsx scripts/test-xui.ts
 *
 * Optional:
 *   XUI_SECURE=true     - Use HTTPS (default: false)
 *   XUI_PATH=/panel-xxx - Custom panel path prefix
 */

import { XuiClient } from "../src/services/xui";
import { generateClientEmail } from "../src/services/xui/repository";

const config = {
  host: process.env.XUI_HOST!,
  port: parseInt(process.env.XUI_PORT || "2053"),
  username: process.env.XUI_USER!,
  password: process.env.XUI_PASS!,
  inboundId: parseInt(process.env.INBOUND_ID || "1"),
  secure: process.env.XUI_SECURE === "true",
  basePath: process.env.XUI_PATH || "",
};

// Validate required env vars
const missing = ["XUI_HOST", "XUI_USER", "XUI_PASS"].filter(
  (key) => !process.env[key]
);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  console.error(
    "\nUsage: XUI_HOST=x XUI_USER=x XUI_PASS=x npx tsx scripts/test-xui.ts"
  );
  process.exit(1);
}

async function main() {
  console.log("=== 3x-ui Integration Test ===\n");
  console.log(`Server: ${config.secure ? "https" : "http"}://${config.host}:${config.port}${config.basePath}`);
  console.log(`Inbound ID: ${config.inboundId}\n`);

  const client = new XuiClient(config);
  let testClientUuid: string | null = null;
  const testEmail = generateClientEmail(99999); // Use fake user ID for test

  try {
    // 1. Login
    console.log("1. Testing login...");
    await client.login();
    console.log("   OK - Authenticated successfully\n");

    // 2. Get inbound info
    console.log("2. Fetching inbound info...");
    const inbound = await client.getInbound();
    console.log(`   OK - Inbound: "${inbound.remark}" (${inbound.protocol})`);
    console.log(`   Port: ${inbound.port}, Enabled: ${inbound.enable}\n`);

    // 3. Get inbound stats
    console.log("3. Fetching inbound stats...");
    const stats = await client.getInboundStats();
    console.log(`   OK - Clients: ${stats.clientCount} (${stats.activeClientCount} active)`);
    console.log(
      `   Traffic: ${formatBytes(stats.up)} up / ${formatBytes(stats.down)} down\n`
    );

    // 4. List existing clients
    console.log("4. Listing existing clients...");
    const existingClients = await client.listClients();
    console.log(`   OK - Found ${existingClients.length} clients`);
    if (existingClients.length > 0) {
      console.log(`   First client: ${existingClients[0].email}`);
    }
    console.log();

    // 5. Create test client
    console.log("5. Creating test client...");
    testClientUuid = await client.addClient({
      email: testEmail,
      limitIp: 2,
      totalGB: 10,
      expiryTime: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      tgId: "test_integration",
    });
    console.log(`   OK - Created client: ${testClientUuid}`);
    console.log(`   Email: ${testEmail}\n`);

    // 6. Verify client was created
    console.log("6. Verifying client exists...");
    const createdClient = await client.getClient(testClientUuid);
    if (!createdClient) {
      throw new Error("Client not found after creation!");
    }
    console.log(`   OK - Client found`);
    console.log(`   Flow: ${createdClient.flow}`);
    console.log(`   Limit IP: ${createdClient.limitIp}`);
    console.log(`   Total GB: ${createdClient.totalGB}`);
    console.log(`   Enabled: ${createdClient.enable}\n`);

    // 7. Get traffic (may be null for new client)
    console.log("7. Fetching client traffic...");
    const traffic = await client.getClientTraffic(testClientUuid);
    if (traffic && (traffic.up > 0 || traffic.down > 0)) {
      console.log(
        `   OK - Traffic: ${formatBytes(traffic.up)} up / ${formatBytes(traffic.down)} down\n`
      );
    } else {
      console.log("   OK - No traffic recorded yet (expected for new client)\n");
    }

    // 8. Update client
    console.log("8. Updating client (disable)...");
    await client.setClientEnabled(testClientUuid, false);
    const updatedClient = await client.getClient(testClientUuid);
    if (updatedClient?.enable !== false) {
      throw new Error("Client was not disabled!");
    }
    console.log("   OK - Client disabled\n");

    // 9. Re-enable
    console.log("9. Re-enabling client...");
    await client.setClientEnabled(testClientUuid, true);
    const reenabledClient = await client.getClient(testClientUuid);
    if (reenabledClient?.enable !== true) {
      throw new Error("Client was not re-enabled!");
    }
    console.log("   OK - Client re-enabled\n");

    // 10. Delete test client
    console.log("10. Deleting test client...");
    await client.deleteClient(testClientUuid);
    testClientUuid = null; // Mark as deleted
    console.log("    OK - Client deleted\n");

    // 11. Verify deletion
    console.log("11. Verifying deletion...");
    const deletedClient = await client.getClient(testClientUuid!);
    if (deletedClient) {
      throw new Error("Client still exists after deletion!");
    }
    console.log("    OK - Client no longer exists\n");

    console.log("=== All tests passed! ===");
  } catch (error) {
    console.error("\nTest failed:", error);

    // Cleanup: try to delete test client if it was created
    if (testClientUuid) {
      console.log("\nCleaning up test client...");
      try {
        await client.deleteClient(testClientUuid);
        console.log("Cleanup successful");
      } catch {
        console.error(`Failed to cleanup. Manual deletion needed: ${testClientUuid}`);
      }
    }

    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

main();
