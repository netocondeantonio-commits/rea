/** Read graph facts out of one REA JSON document. Labels come from the engine. */

const GRAPH_KEYS = ["graph", "semantic_graph", "application_graph"];
const SEMANTIC_KEEP = new Set([
  "function",
  "module",
  "class",
  "method",
  "endpoint",
  "file",
]);

const isGraph = (value) =>
  Boolean(value) &&
  typeof value === "object" &&
  Array.isArray(value.nodes) &&
  Array.isArray(value.edges);

const labelOf = (node) => {
  if (typeof node.label === "string" && node.label.trim())
    return node.label.trim();
  const first = Array.isArray(node.observations)
    ? node.observations[0]
    : undefined;
  if (first && typeof first.label === "string" && first.label.trim())
    return first.label.trim();
  const key = node.identity?.key;
  if (typeof key === "string" && key.includes(":")) {
    const piece = key.split(":").pop();
    if (piece) return piece;
  }
  return typeof node.kind === "string" ? node.kind : "item";
};

const nodeFrom = (node, index) => ({
  nodeId: String(node.node_id ?? index),
  label: labelOf(node).slice(0, 80),
  kind: typeof node.kind === "string" ? node.kind : "item",
});

const keepNode = (graph, node, semantic) => {
  if (!semantic || graph.nodes.length <= 15) return true;
  return SEMANTIC_KEEP.has(typeof node.kind === "string" ? node.kind : "");
};

const graphFrom = (graph, key, sourceName) => {
  const semantic = key === "semantic_graph";
  const nodes = [];
  for (const node of graph.nodes) {
    if (!node || typeof node !== "object") continue;
    if (!keepNode(graph, node, semantic)) continue;
    nodes.push(nodeFrom(node, nodes.length));
  }
  const edges = [];
  for (const edge of graph.edges) {
    if (!edge || typeof edge !== "object") continue;
    edges.push({
      from: String(edge.source_node_id ?? ""),
      to: String(edge.target_node_id ?? ""),
      relation: String(edge.relation ?? "link").slice(0, 40),
    });
  }
  return {
    sourceName,
    name: key,
    nodes,
    edges,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
  };
};

export const graphsFromDocument = (document, sourceName) => {
  const root =
    document?.normalized_result &&
    typeof document.normalized_result === "object" &&
    !Array.isArray(document.normalized_result)
      ? document.normalized_result
      : document;
  if (!root || typeof root !== "object") return [];
  const graphs = [];
  for (const key of GRAPH_KEYS) {
    if (isGraph(root[key])) graphs.push(graphFrom(root[key], key, sourceName));
  }
  return graphs;
};

export const functionsFromDocument = (document) => {
  const nodes = document?.normalized_result?.semantic_graph?.nodes;
  if (!Array.isArray(nodes)) return [];
  const found = [];
  for (const node of nodes) {
    if (!node || node.kind !== "function") continue;
    const line = node.evidence?.location?.value?.start?.line;
    const modulePath = node.identity?.module_path;
    found.push({
      name: String(node.label ?? "function").slice(0, 80),
      module: typeof modulePath === "string" ? modulePath : "",
      line: typeof line === "number" ? line : null,
    });
    if (found.length >= 40) break;
  }
  return found;
};

export const limitationsFromDocument = (document) => {
  const lists = [
    document?.limitations,
    document?.normalized_result?.limitations,
    document?.normalized_result?.graph?.limitations,
  ];
  const seen = new Set();
  const lines = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item !== "string" || seen.has(item)) continue;
      seen.add(item);
      lines.push(item);
      if (lines.length >= 30) return lines;
    }
  }
  return lines;
};

export const subjectFromDocument = (document) => {
  const subject = document?.subject;
  if (!subject || typeof subject !== "object") return null;
  const sha = subject.digest?.sha256;
  return {
    name: typeof subject.name === "string" ? subject.name : "",
    format: typeof subject.format === "string" ? subject.format : "",
    architecture:
      typeof subject.architecture === "string" ? subject.architecture : "",
    sha256: typeof sha === "string" ? sha : "",
  };
};

const flattenCounts = (prefix, value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rows = [];
  for (const [key, field] of Object.entries(value)) {
    if (typeof field === "number")
      rows.push({ key: `${prefix}.${key}`, value: field });
    if (!field || typeof field !== "object" || Array.isArray(field)) continue;
    for (const [inner, innerValue] of Object.entries(field)) {
      if (typeof innerValue === "number")
        rows.push({ key: `${prefix}.${key}.${inner}`, value: innerValue });
    }
  }
  return rows;
};

export const countsFromDocument = (document) => {
  const summary = document?.normalized_result?.summary;
  const statistics = document?.normalized_result?.statistics;
  return [
    ...flattenCounts("summary", summary),
    ...flattenCounts("statistics", statistics),
  ].slice(0, 40);
};

export const fieldsFromDocument = (document) => {
  const value = document?.normalized_result;
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rows = [];
  for (const [key, field] of Object.entries(value)) {
    if (["string", "number", "boolean"].includes(typeof field))
      rows.push({ key, value: String(field).slice(0, 180) });
  }
  return rows.slice(0, 20);
};

export const excerptFromDocument = (document) => {
  const value = document?.normalized_result;
  if (typeof value === "string" && value.trim()) return value.slice(0, 800);
  const stdout = document?.raw_result?.stdout;
  return typeof stdout === "string" ? stdout.slice(0, 800) : "";
};

const METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const routeFrom = (value, sourceName) => {
  const method =
    typeof value.method === "string" ? value.method.toUpperCase() : "";
  const path = value.path ?? value.route ?? value.endpoint;
  if (!METHODS.has(method) || typeof path !== "string" || !path.startsWith("/"))
    return undefined;
  return {
    method,
    path: path.slice(0, 180),
    file: sourceName,
    line: null,
    origin: "evidence",
  };
};

/** Collect HTTP-shaped records the engine already stored. Bounded walk. */
export const httpFromDocument = (document, sourceName) => {
  const found = [];
  const stack = [{ value: document, depth: 0 }];
  let seen = 0;
  while (stack.length > 0 && found.length < 40 && seen < 8000) {
    const current = stack.pop();
    if (!current?.value || typeof current.value !== "object") continue;
    seen += 1;
    if (!Array.isArray(current.value)) {
      const route = routeFrom(current.value, sourceName);
      if (route) found.push(route);
    }
    if (current.depth >= 6) continue;
    for (const child of Object.values(current.value)) {
      if (child && typeof child === "object")
        stack.push({ value: child, depth: current.depth + 1 });
    }
  }
  return found;
};

const escapeMermaid = (value) =>
  String(value)
    .replaceAll('"', "'")
    .replaceAll(/[|[\]{}]/gu, " ")
    .replaceAll("\n", " ");

export const mermaidFromGraphs = (graphs) => {
  const lines = ["flowchart TD"];
  const kept = new Map();
  let serial = 0;
  let omitted = 0;
  for (const graph of graphs) {
    const room = 30 - kept.size;
    if (room <= 0) {
      omitted += graph.nodes.length;
      continue;
    }
    const visible = graph.nodes.slice(0, room);
    omitted += Math.max(0, graph.nodes.length - visible.length);
    for (const node of visible) {
      const id = `n${serial}`;
      serial += 1;
      kept.set(`${graph.name}:${node.nodeId}`, id);
      lines.push(
        `  ${id}["${escapeMermaid(node.label)} · ${escapeMermaid(node.kind)}"]`,
      );
    }
    for (const edge of graph.edges) {
      const from = kept.get(`${graph.name}:${edge.from}`);
      const to = kept.get(`${graph.name}:${edge.to}`);
      if (!from || !to) continue;
      lines.push(`  ${from} -->|${escapeMermaid(edge.relation)}| ${to}`);
    }
  }
  if (kept.size === 0) lines.push('  n0["nenhum grafo / no graph"]');
  return { text: `${lines.join("\n")}\n`, omitted };
};

const xml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const visibleGraph = (graphs) => {
  const nodes = [];
  const indexBy = new Map();
  for (const graph of graphs) {
    for (const node of graph.nodes) {
      if (nodes.length >= 24) break;
      indexBy.set(`${graph.name}:${node.nodeId}`, nodes.length);
      nodes.push(node);
    }
  }
  const edges = [];
  for (const graph of graphs) {
    for (const edge of graph.edges) {
      const from = indexBy.get(`${graph.name}:${edge.from}`);
      const to = indexBy.get(`${graph.name}:${edge.to}`);
      if (from === undefined || to === undefined || edges.length >= 24)
        continue;
      edges.push({ from, to, relation: edge.relation });
    }
  }
  return { nodes, edges };
};

const svgBox = (node, index) => {
  const y = 16 + index * 48;
  return `<rect x="16" y="${y}" width="420" height="36" rx="8" fill="#fffdf9" stroke="#2f5d50"/>
<text x="28" y="${y + 23}" font-family="Georgia, serif" font-size="14" fill="#1c1915">${xml(node.label)} · ${xml(node.kind)}</text>`;
};

const svgEdge = (edge) => {
  const y1 = 34 + edge.from * 48;
  const y2 = 34 + edge.to * 48;
  const labelY = Math.round((y1 + y2) / 2);
  return `<path d="M 436 ${y1} C 560 ${y1}, 560 ${y2}, 436 ${y2}" fill="none" stroke="#2f5d50"/>
<text x="470" y="${labelY}" font-family="Georgia, serif" font-size="12" fill="#5c564c">${xml(edge.relation)}</text>`;
};

/** One static drawing. Arrows use only links the engine recorded. */
export const svgFromGraphs = (graphs) => {
  const visible = visibleGraph(graphs);
  const nodes =
    visible.nodes.length > 0
      ? visible.nodes
      : [{ label: "nenhum grafo / no graph", kind: "note" }];
  const height = 36 + nodes.length * 48;
  const edges = visible.nodes.length > 0 ? visible.edges.map(svgEdge) : [];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="${height}" viewBox="0 0 760 ${height}">
<rect width="760" height="${height}" fill="#f7f3ec"/>
${nodes.map(svgBox).join("\n")}
${edges.join("\n")}
</svg>
`;
};
