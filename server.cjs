const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs").promises;
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const dotenv = require("dotenv");

dotenv.config();

const baseDir = path.dirname(__filename);
const CONVO_DIR = path.join(baseDir, "convo-history");

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "https://ollama.emancancode.online";
const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL ||
  "huihui_ai/deepseek-r1-abliterated:32b-qwen-distill";
const TEMPERATURE = Number(process.env.TEMPERATURE || 0.7);
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 8192);

// ensure convo dir
try {
  fs.mkdirSync(CONVO_DIR, { recursive: true });
} catch (e) {}

async function listConversations() {
  try {
    const files = await fsp.readdir(CONVO_DIR);
    const conversations = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await fsp.readFile(path.join(CONVO_DIR, file), "utf-8");
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
        /* ignore */
      }
    }
    conversations.sort((a, b) => new Date(b.updated) - new Date(a.updated));
    return conversations;
  } catch (err) {
    return [];
  }
}

async function loadConversation(id) {
  try {
    const content = await fsp.readFile(
      path.join(CONVO_DIR, `${id}.json`),
      "utf-8"
    );
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function saveConversation(data) {
  try {
    const filePath = path.join(CONVO_DIR, `${data.id}.json`);
    await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Error saving conversation", err.message);
    return false;
  }
}

async function deleteConversation(id) {
  try {
    await fsp.unlink(path.join(CONVO_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}

async function fetchOllamaModels() {
  try {
    const url = `${OLLAMA_BASE_URL.replace(/\/+$/, "")}/api/tags`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error("fetch models error", err.message);
    return { models: [] };
  }
}

function processContent(text) {
  let processed = text.replace(/<<THINKING>>[\s\S]*?<\/THINKING>>/g, "");
  processed = processed
    .replace(/<<RESPONSE>>/g, "")
    .replace(/<\/RESPONSE>>/g, "");
  processed = processed.replace(/<think>[\s\S]*?<\/think>/g, "");
  return processed;
}

async function streamOllamaChat(messages, model, res) {
  const url = `${OLLAMA_BASE_URL.replace(/\/+$/, "")}/api/chat`;
  const payload = {
    model: model || OLLAMA_MODEL,
    stream: true,
    messages,
    options: { temperature: TEMPERATURE, num_predict: MAX_TOKENS },
  };

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message: err.message })}\n\n`);
    throw err;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    res.write(`event: error\n`);
    res.write(
      `data: ${JSON.stringify({ message: `HTTP ${response.status}` })}\n\n`
    );
    throw new Error(`HTTP ${response.status}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body) {
    const textChunk = decoder.decode(chunk, { stream: true });
    buffer += textChunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let data;
      try {
        data = JSON.parse(t);
      } catch {
        continue;
      }
      const content = data.message?.content || "";
      if (content) {
        const clean = processContent(content);
        if (clean) {
          try {
            res.write(`event: response\n`);
            res.write(`data: ${JSON.stringify({ text: clean })}\n\n`);
          } catch {}
        }
      }
    }
  }

  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer.trim());
      const content = data.message?.content || "";
      if (content) {
        const clean = processContent(content);
        if (clean) {
          res.write(`event: response\n`);
          res.write(`data: ${JSON.stringify({ text: clean })}\n\n`);
        }
      }
    } catch {}
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let acc = "";
    req.on("data", (c) => (acc += c.toString()));
    req.on("end", () => {
      try {
        resolve(JSON.parse(acc));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

async function findConversationByMessages(messages) {
  try {
    const files = await fsp.readdir(CONVO_DIR);
    const target = messages || [];

    // Prefer exact match first
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await fsp.readFile(path.join(CONVO_DIR, file), "utf-8");
        const convo = JSON.parse(content);
        const existing = convo.messages || [];
        if (JSON.stringify(existing) === JSON.stringify(target)) {
          return { id: convo.id, exact: true };
        }
      } catch {}
    }

    // If no exact match, look for a conversation whose messages are a prefix of the provided messages
    let best = { id: null, len: -1 };
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await fsp.readFile(path.join(CONVO_DIR, file), "utf-8");
        const convo = JSON.parse(content);
        const existing = convo.messages || [];
        if (existing.length === 0) continue;
        if (existing.length <= target.length) {
          let isPrefix = true;
          for (let i = 0; i < existing.length; i++) {
            if (JSON.stringify(existing[i]) !== JSON.stringify(target[i])) {
              isPrefix = false;
              break;
            }
          }
          if (isPrefix && existing.length > best.len) {
            best = { id: convo.id, len: existing.length };
          }
        }
      } catch {}
    }

    if (best.id) return { id: best.id, exact: false };
    return null;
  } catch (err) {
    return null;
  }
}

function startServer() {
  const port = Number(process.env.PORT || 3000);
  const bindHost = process.env.BIND_HOST || "127.0.0.1";

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
      if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      if (u.pathname === "/" || u.pathname === "/client.html") {
        try {
          const html = await fsp.readFile(
            path.join(baseDir, "client.html"),
            "utf-8"
          );
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            ...corsHeaders,
          });
          res.end(html);
          return;
        } catch (err) {
          res.writeHead(500);
          res.end("Failed to read client.html");
          return;
        }
      }

      if (u.pathname === "/api/models" && req.method === "GET") {
        const models = await fetchOllamaModels();
        res.writeHead(200, {
          "Content-Type": "application/json",
          ...corsHeaders,
        });
        res.end(JSON.stringify(models));
        return;
      }

      if (u.pathname === "/api/conversations" && req.method === "GET") {
        const convos = await listConversations();
        res.writeHead(200, {
          "Content-Type": "application/json",
          ...corsHeaders,
        });
        res.end(JSON.stringify({ conversations: convos }));
        return;
      }

      if (
        u.pathname.startsWith("/api/conversations/") &&
        req.method === "GET"
      ) {
        const id = u.pathname.split("/")[3];
        const convo = await loadConversation(id);
        if (convo) {
          res.writeHead(200, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify(convo));
        } else {
          res.writeHead(404, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify({ error: "Conversation not found" }));
        }
        return;
      }

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

      if (u.pathname === "/api/conversations" && req.method === "POST") {
        const body = await readBody(req);
        if (body) {
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
                // existing conversation is a prefix of the provided messages -> update/merge
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
                  // fall through and create new if save fails
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

      if (u.pathname === "/api/chat" && req.method === "POST") {
        const body = await readBody(req);
        if (!body || !body.messages) {
          res.writeHead(400, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify({ error: "No messages provided" }));
          return;
        }

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...corsHeaders,
        });
        const keep = setInterval(() => {
          try {
            res.write(":\n\n");
          } catch {}
        }, 15000);
        let clientDisconnected = false;
        req.on("close", () => {
          clientDisconnected = true;
          clearInterval(keep);
        });
        try {
          if (!clientDisconnected) {
            await streamOllamaChat(body.messages, body.model, res);
            if (!clientDisconnected && !res.writableEnded) {
              res.write(`event: done\n`);
              res.write(`data: ${JSON.stringify({ ok: true })}\n\n`);
            }
          }
        } catch (err) {
          if (!clientDisconnected && !res.writableEnded) {
            res.write(`event: error\n`);
            res.write(`data: ${JSON.stringify({ message: err.message })}\n\n`);
          }
        } finally {
          clearInterval(keep);
          try {
            if (!res.writableEnded) res.end();
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

  return new Promise((resolve, reject) => {
    server.listen(port, bindHost, () => {
      console.log(`EmanAI server listening on http://${bindHost}:${port}/`);
      resolve({ server, port, host: bindHost });
    });
    server.on("error", reject);
  });
}

module.exports = {
  startServer,
  listConversations,
  loadConversation,
  saveConversation,
};
