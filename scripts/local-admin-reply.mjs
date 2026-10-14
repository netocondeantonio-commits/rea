/** Small JSON helpers for the loopback admin page. */

export const send = (response, status, body, type) => {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
  });
  response.end(body);
};

export const json = (response, status, value) =>
  send(response, status, JSON.stringify(value), "application/json");

export const fail = (response, status, message, messageEn) =>
  json(response, status, { message, message_en: messageEn });

export const readJsonBody = (request) =>
  new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size <= 32_768) chunks.push(chunk);
    });
    request.on("end", () => {
      if (size > 32_768) {
        resolve(undefined);
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (raw.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(undefined);
      }
    });
  });
