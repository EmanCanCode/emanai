#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVO_DIR = path.join(__dirname, "convo-history");

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "https://ollama.emancancode.online";
const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL ||
  "huihui_ai/deepseek-r1-abliterated:32b-qwen-distill";
const TEMPERATURE = 0.7;
const MAX_TOKENS = 8192;

// Track active streams for cleanup
const activeStreams = new Set();

// Ensure conversation directory exists
await fs.mkdir(CONVO_DIR, { recursive: true });

/**
 * Conversation Helper Functions
 */
async function listConversations() {
  try {
    const files = await fs.readdir(CONVO_DIR);
    const conversations = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await fs.readFile(path.join(CONVO_DIR, file), "utf-8");
        const convo = JSON.parse(content);
        conversations.push({
          id: convo.id,
          title: convo.title,
          created: convo.created,
          updated: convo.updated,
          messageCount: convo.messages?.length || 0,
          model: convo.model,
        });
      } catch (err) {
        console.error(`Error reading conversation ${file}:`, err.message);
      }
    }

    // Sort by updated timestamp, most recent first
    conversations.sort((a, b) => new Date(b.updated) - new Date(a.updated));
    return conversations;
  } catch (err) {
    return [];
  }
}

async function loadConversation(id) {
  try {
    const filePath = path.join(CONVO_DIR, `${id}.json`);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

async function saveConversation(data) {
  try {
    const filePath = path.join(CONVO_DIR, `${data.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Error saving conversation:", err.message);
    return false;
  }
}

// Try to find an existing conversation that matches the provided messages.
// Returns { id, exact } when found, or null when not. Prefer exact match;
// otherwise return a conversation whose messages are a prefix of the provided messages
// so we can merge/append instead of creating duplicates.
async function findConversationByMessages(messages) {
  try {
    const files = await fs.readdir(CONVO_DIR);
    const target = messages || [];

    // exact match first
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await fs.readFile(path.join(CONVO_DIR, file), "utf-8");
        const convo = JSON.parse(content);
        const existing = convo.messages || [];
        if (JSON.stringify(existing) === JSON.stringify(target))
          return { id: convo.id, exact: true };
      } catch {}
    }

    // prefix match (choose the longest prefix)
    let best = { id: null, len: -1 };
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await fs.readFile(path.join(CONVO_DIR, file), "utf-8");
        const convo = JSON.parse(content);
        const existing = convo.messages || [];
        if (!existing.length) continue;
        if (existing.length <= target.length) {
          let isPrefix = true;
          for (let i = 0; i < existing.length; i++) {
            if (JSON.stringify(existing[i]) !== JSON.stringify(target[i])) {
              isPrefix = false;
              break;
            }
          }
          if (isPrefix && existing.length > best.len)
            best = { id: convo.id, len: existing.length };
        }
      } catch {}
    }

    if (best.id) return { id: best.id, exact: false };
  } catch (err) {
    // ignore
  }
  return null;
}

async function deleteConversation(id) {
  try {
    const filePath = path.join(CONVO_DIR, `${id}.json`);
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Ollama API Functions
 */
async function fetchOllamaModels() {
  try {
    const url = `${OLLAMA_BASE_URL.replace(/\/+$/, "")}/api/tags`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error("Error fetching models:", err.message);
    return { models: [] };
  }
}

async function streamOllamaChat(messages, model, res) {
  const url = `${OLLAMA_BASE_URL.replace(/\/+$/, "")}/api/chat`;

  const payload = {
    model: model || OLLAMA_MODEL,
    stream: true,
    messages: messages,
    options: {
      temperature: TEMPERATURE,
      num_predict: MAX_TOKENS,
    },
  };

  console.log("[STREAM] Connecting to Ollama:", url);
  console.log("[STREAM] Using model:", payload.model);

  // Track this stream
  const streamTracker = { res, active: true };
  activeStreams.add(streamTracker);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log("[STREAM] Ollama responded with status:", response.status);
  } catch (err) {
    console.log("[STREAM] Network error:", err.message);
    activeStreams.delete(streamTracker);
    res.write(`event: error\n`);
    res.write(
      `data: ${JSON.stringify({
        message: `Network error: ${err.message}`,
      })}\n\n`
    );
    throw err;
  }

  if (!response.ok) {
    activeStreams.delete(streamTracker);
    const text = await response.text().catch(() => "");
    console.log("[STREAM] HTTP error:", response.status, text.slice(0, 200));
    res.write(`event: error\n`);
    res.write(
      `data: ${JSON.stringify({
        message: `HTTP ${response.status}: ${text}`,
      })}\n\n`
    );
    throw new Error(`HTTP ${response.status}`);
  }

  console.log("[STREAM] Starting to read stream...");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullAnswer = "";

  const sendSSE = (event, data) => {
    if (!streamTracker.active || res.writableEnded) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  // Helper to strip thinking tags and extract content
  function processContent(text) {
    // Remove <<THINKING>>...</THINKING>> tags and their content
    let processed = text.replace(/<<THINKING>>[\s\S]*?<\/THINKING>>/g, "");

    // Remove <<RESPONSE>> and <</RESPONSE>> tags but keep the content
    processed = processed
      .replace(/<<RESPONSE>>/g, "")
      .replace(/<\/RESPONSE>>/g, "");

    // Also handle <think> tags some models use
    processed = processed.replace(/<think>[\s\S]*?<\/think>/g, "");

    return processed;
  }

  try {
    for await (const chunk of response.body) {
      if (!streamTracker.active || res.writableEnded) break;

      const textChunk = decoder.decode(chunk, { stream: true });
      buffer += textChunk;

      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let data;
        try {
          data = JSON.parse(trimmed);
        } catch {
          continue;
        }

        const content = data.message?.content || "";
        if (content) {
          // Process content to remove thinking tags
          const cleanContent = processContent(content);

          if (cleanContent) {
            sendSSE("response", { text: cleanContent });
            fullAnswer += cleanContent;
          }
        }
      }
    }

    if (buffer.trim() && streamTracker.active && !res.writableEnded) {
      try {
        const data = JSON.parse(buffer.trim());
        const content = data.message?.content || "";
        if (content) {
          const cleanContent = processContent(content);
          if (cleanContent) {
            sendSSE("response", { text: cleanContent });
            fullAnswer += cleanContent;
          }
        }
      } catch {}
    }
  } catch (err) {
    if (streamTracker.active && !res.writableEnded) {
      sendSSE("error", { message: err.message });
    }
    throw err;
  } finally {
    streamTracker.active = false;
    activeStreams.delete(streamTracker);
  }

  return fullAnswer.trim();
}

/**
 * HTTP Server
 */
function startServer() {
  const port = Number(process.env.PORT || 3000);

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(
        req.url || "",
        `http://${req.headers.host || "localhost"}`
      );
      const corsHeaders = {
        "Access-Control-Allow-Origin": process.env.PUBLIC_ORIGIN || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      // Serve client.html
      if (u.pathname === "/" || u.pathname === "/client.html") {
        try {
          const html = await fs.readFile(
            new URL("./client.html", import.meta.url)
          );
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            ...corsHeaders,
          });
          res.end(html);
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Failed to read client.html");
        }
        return;
      }

      // GET /api/models - List available Ollama models
      if (u.pathname === "/api/models" && req.method === "GET") {
        const models = await fetchOllamaModels();
        res.writeHead(200, {
          "Content-Type": "application/json",
          ...corsHeaders,
        });
        res.end(JSON.stringify(models));
        return;
      }

      // GET /api/conversations - List all conversations
      if (u.pathname === "/api/conversations" && req.method === "GET") {
        const conversations = await listConversations();
        res.writeHead(200, {
          "Content-Type": "application/json",
          ...corsHeaders,
        });
        res.end(JSON.stringify({ conversations }));
        return;
      }

      // GET /api/conversations/:id - Load specific conversation
      if (
        u.pathname.startsWith("/api/conversations/") &&
        req.method === "GET"
      ) {
        const id = u.pathname.split("/")[3];
        const conversation = await loadConversation(id);
        if (conversation) {
          res.writeHead(200, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify(conversation));
        } else {
          res.writeHead(404, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify({ error: "Conversation not found" }));
        }
        return;
      }

      // PUT /api/conversations/:id - Update conversation
      if (
        u.pathname.startsWith("/api/conversations/") &&
        req.method === "PUT"
      ) {
        const id = u.pathname.split("/")[3];
        const body = await readBody(req);
        if (body && body.id === id) {
          const success = await saveConversation(body);
          res.writeHead(success ? 200 : 500, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify({ success }));
        } else {
          res.writeHead(400, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify({ error: "Invalid request" }));
        }
        return;
      }

      // DELETE /api/conversations/:id - Delete conversation
      if (
        u.pathname.startsWith("/api/conversations/") &&
        req.method === "DELETE"
      ) {
        const id = u.pathname.split("/")[3];
        const success = await deleteConversation(id);
        res.writeHead(success ? 200 : 404, {
          "Content-Type": "application/json",
          ...corsHeaders,
        });
        res.end(JSON.stringify({ success }));
        return;
      }

      // POST /api/conversations - Create new conversation (dedupe by messages)
      if (u.pathname === "/api/conversations" && req.method === "POST") {
        const body = await readBody(req);
        if (body) {
          // If messages are provided, try to find an existing conversation with identical messages
          if (body.messages && Array.isArray(body.messages)) {
            const existing = await findConversationByMessages(body.messages);
            if (existing) {
              if (existing.exact) {
                res.writeHead(200, {
                  "Content-Type": "application/json",
                  ...corsHeaders,
                });
                res.end(
                  JSON.stringify({
                    success: true,
                    id: existing.id,
                    duplicate: true,
                  })
                );
                return;
              } else {
                // existing conversation is a prefix -> merge/update it
                try {
                  const convo = (await loadConversation(existing.id)) || {
                    id: existing.id,
                  };
                  convo.messages = body.messages;
                  if (body.title) convo.title = body.title;
                  convo.updated = new Date().toISOString();
                  await saveConversation(convo);
                  res.writeHead(200, {
                    "Content-Type": "application/json",
                    ...corsHeaders,
                  });
                  res.end(
                    JSON.stringify({
                      success: true,
                      id: existing.id,
                      merged: true,
                    })
                  );
                  return;
                } catch (err) {
                  // fall through and create new if merge fails
                }
              }
            }
          }

          if (!body.id) body.id = randomUUID();
          if (!body.created) body.created = new Date().toISOString();
          body.updated = new Date().toISOString();

          const success = await saveConversation(body);
          res.writeHead(success ? 200 : 500, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify({ success, id: body.id }));
        } else {
          res.writeHead(400, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify({ error: "Invalid request" }));
        }
        return;
      }

      // POST /api/chat - Stream chat responses (SSE)
      if (u.pathname === "/api/chat" && req.method === "POST") {
        console.log("[CHAT] New chat request received");

        // Read body FIRST, before writing headers
        const body = await readBody(req);
        console.log("[CHAT] Request body:", JSON.stringify(body).slice(0, 200));

        if (!body || !body.messages) {
          res.writeHead(400, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify({ error: "No messages provided" }));
          return;
        }

        // NOW write SSE headers after we have the body
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...corsHeaders,
        });

        const keepAlive = setInterval(() => {
          try {
            res.write(":\n\n");
          } catch {}
        }, 15000);

        // Handle client disconnect
        let clientDisconnected = false;
        req.on("close", () => {
          clientDisconnected = true;
          console.log("[CHAT] Client disconnected");
          clearInterval(keepAlive);
        });

        try {
          if (!clientDisconnected) {
            console.log(
              "[CHAT] Starting stream with model:",
              body.model || OLLAMA_MODEL
            );
            await streamOllamaChat(body.messages, body.model, res);
            if (!clientDisconnected && !res.writableEnded) {
              console.log("[CHAT] Stream completed successfully");
              res.write(`event: done\n`);
              res.write(`data: ${JSON.stringify({ ok: true })}\n\n`);
            }
          }
        } catch (err) {
          console.log("[CHAT] Error:", err.message);
          if (!clientDisconnected && !res.writableEnded) {
            res.write(`event: error\n`);
            res.write(`data: ${JSON.stringify({ message: err.message })}\n\n`);
          }
        } finally {
          clearInterval(keepAlive);
          try {
            if (!res.writableEnded) {
              res.end();
            }
          } catch {}
        }
        return;
      }

      // 404
      res.writeHead(404, { "Content-Type": "text/plain", ...corsHeaders });
      res.end("Not found");
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String(err?.message || err));
    }
  });

  const bindHost = process.env.BIND_HOST || "127.0.0.1";
  server.listen(port, bindHost, () => {
    console.log(`\nEmanAI server listening on http://${bindHost}:${port}/`);
    console.log(`Ollama server: ${OLLAMA_BASE_URL}`);
    console.log(`Default model: ${OLLAMA_MODEL}\n`);
  });
}

async function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    console.log("[READBODY] Starting to read request body...");
    req.on("data", (chunk) => {
      data += chunk.toString();
      console.log("[READBODY] Received chunk, total length:", data.length);
    });
    req.on("end", () => {
      console.log("[READBODY] Body complete, length:", data.length);
      try {
        const parsed = JSON.parse(data);
        console.log("[READBODY] Successfully parsed JSON");
        resolve(parsed);
      } catch (e) {
        console.log("[READBODY] JSON parse error:", e.message);
        resolve(null);
      }
    });
    req.on("error", (err) => {
      console.log("[READBODY] Request error:", err.message);
      resolve(null);
    });
  });
}

process.on("SIGINT", () => {
  console.log("\nShutting down EmanAI server...\n");

  // Clean up active streams
  for (const streamTracker of activeStreams) {
    streamTracker.active = false;
    try {
      if (!streamTracker.res.writableEnded) {
        streamTracker.res.write(`event: error\n`);
        streamTracker.res.write(
          `data: ${JSON.stringify({ message: "Server shutting down" })}\n\n`
        );
        streamTracker.res.end();
      }
    } catch {}
  }
  activeStreams.clear();

  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down EmanAI server...\n");

  // Clean up active streams
  for (const streamTracker of activeStreams) {
    streamTracker.active = false;
    try {
      if (!streamTracker.res.writableEnded) {
        streamTracker.res.end();
      }
    } catch {}
  }
  activeStreams.clear();

  process.exit(0);
});

startServer();
