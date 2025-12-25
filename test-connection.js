#!/usr/bin/env node
import dotenv from "dotenv";

dotenv.config();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "https://ollama.emancancode.online";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "huihui_ai/deepseek-r1-abliterated:32b-qwen-distill";

console.log("Testing Ollama connection...");
console.log("Server:", OLLAMA_BASE_URL);
console.log("Model:", OLLAMA_MODEL);
console.log("");

// Test 1: Check if models endpoint is accessible
console.log("Test 1: Checking models endpoint...");
try {
  const modelsRes = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  if (modelsRes.ok) {
    const data = await modelsRes.json();
    console.log("✓ Models endpoint accessible");
    console.log(`  Found ${data.models?.length || 0} models`);
    if (data.models?.length > 0) {
      console.log("  Available models:");
      data.models.slice(0, 5).forEach(m => console.log(`    - ${m.name}`));
    }
  } else {
    console.log("✗ Models endpoint returned:", modelsRes.status);
  }
} catch (err) {
  console.log("✗ Models endpoint failed:", err.message);
}

console.log("");

// Test 2: Try a simple chat request
console.log("Test 2: Testing chat endpoint with simple message...");
try {
  const chatRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        { role: "user", content: "Say 'Hello!' and nothing else." }
      ]
    })
  });

  if (chatRes.ok) {
    const data = await chatRes.json();
    console.log("✓ Chat endpoint working");
    console.log("  Response:", data.message?.content || "No content");
  } else {
    const text = await chatRes.text().catch(() => "");
    console.log("✗ Chat endpoint returned:", chatRes.status);
    console.log("  Error:", text.slice(0, 200));
  }
} catch (err) {
  console.log("✗ Chat endpoint failed:", err.message);
}

console.log("");

// Test 3: Try streaming
console.log("Test 3: Testing streaming chat...");
try {
  const streamRes = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: true,
      messages: [
        { role: "user", content: "Count to 3" }
      ]
    })
  });

  if (streamRes.ok) {
    console.log("✓ Stream started successfully");
    const decoder = new TextDecoder();
    let buffer = "";
    let chunks = 0;

    for await (const chunk of streamRes.body) {
      chunks++;
      const text = decoder.decode(chunk, { stream: true });
      buffer += text;

      if (chunks >= 5) {
        console.log("  Received", chunks, "chunks so far...");
        break;
      }
    }

    console.log("✓ Streaming works! Received", chunks, "chunks");
    console.log("  Sample:", buffer.slice(0, 100));
  } else {
    console.log("✗ Stream failed:", streamRes.status);
  }
} catch (err) {
  console.log("✗ Streaming failed:", err.message);
}

console.log("\nDone!");
