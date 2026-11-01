import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "espree";

const HOOK_CALL_RE = /^use[A-Z0-9]/;
const DEFAULT_PATH = "reference/deadline-day-prototyp-v7.jsx";
const IGNORED_WALK_KEYS = new Set(["loc", "range", "start", "end"]);

function splitLines(source) {
  const lines = source.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function parseArgs(argv) {
  const options = { json: false, slice: null, path: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--slice") {
      i += 1;
      options.slice = (argv[i] ?? "").split(",").filter(Boolean);
    } else if (!arg.startsWith("--")) {
      options.path = arg;
    }
  }
  options.path ??= DEFAULT_PATH;
  return options;
}

function walkAll(node, visit) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkAll(item, visit);
    return;
  }
  if (typeof node.type === "string") visit(node);
  for (const key of Object.keys(node)) {
    if (IGNORED_WALK_KEYS.has(key)) continue;
    walkAll(node[key], visit);
  }
}

// Ta sama rekurencja co walkAll, ale zatrzymuje się na granicy zagnieżdżonego
// wpisu (jego węzeł jest w `excludeNodes`) — inaczej treści funkcji zagnieżdżonych
// liczyłyby się podwójnie: raz we własnym wpisie, drugi raz w rodzicu.
function walkOwn(node, excludeNodes, visit) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkOwn(item, excludeNodes, visit);
    return;
  }
  if (excludeNodes.has(node)) return;
  if (typeof node.type === "string") visit(node);
  for (const key of Object.keys(node)) {
    if (IGNORED_WALK_KEYS.has(key)) continue;
    walkOwn(node[key], excludeNodes, visit);
  }
}

function containsJSX(node) {
  let found = false;
  walkAll(node, (n) => {
    if (n.type === "JSXElement" || n.type === "JSXFragment") found = true;
  });
  return found;
}

function unwrapExport(stmt) {
  if (stmt.type === "ExportDefaultDeclaration" || stmt.type === "ExportNamedDeclaration") {
    return { inner: stmt.declaration, exported: true };
  }
  return { inner: stmt, exported: false };
}

function functionBodyList(fnNode) {
  return fnNode.body.type === "BlockStatement" ? fnNode.body.body : null;
}

function collectEntries(programBody, source) {
  const entries = [];

  function makeEntry(fields) {
    const entry = {
      refs: [],
      randomLines: [],
      random: false,
      jsx: false,
      hooks: false,
      referencedBy: [],
      ...fields,
    };
    entries.push(entry);
    return entry;
  }

  // Gałąź renderu bramkowana fazą gry (`if (faza === "okno") { ... return (<jsx/>); }`)
  // to w tym pliku odpowiednik przyszłego osobnego ekranu w src/ui — deklaracje
  // top-level jej nie widzą, więc trzeba ją wykrywać osobno po obecności JSX.
  function visitBody(statements, parentName) {
    let createdHere = 0;
    for (const raw of statements) {
      const { inner, exported } = unwrapExport(raw);
      if (!inner) continue;

      if (inner.type === "FunctionDeclaration" && inner.id) {
        const entry = makeEntry({
          name: inner.id.name,
          parent: parentName,
          kind: "fn",
          node: inner,
          exported,
          startLine: inner.loc.start.line,
          endLine: inner.loc.end.line,
        });
        createdHere += 1;
        const body = functionBodyList(inner);
        if (body) visitBody(body, entry.name);
        continue;
      }

      if (inner.type === "VariableDeclaration") {
        for (const decl of inner.declarations) {
          if (decl.id.type !== "Identifier" || !decl.init) continue;
          const isFn =
            decl.init.type === "ArrowFunctionExpression" || decl.init.type === "FunctionExpression";
          if (isFn) {
            const entry = makeEntry({
              name: decl.id.name,
              parent: parentName,
              kind: "fn",
              node: decl.init,
              exported,
              startLine: decl.loc.start.line,
              endLine: decl.loc.end.line,
            });
            createdHere += 1;
            const body = functionBodyList(decl.init);
            if (body) visitBody(body, entry.name);
          } else if (parentName === null) {
            // Dane zagnieżdżone (lokalne stałe) celowo pomijamy — na tym pliku
            // to głównie jednorazowe zmienne pomocnicze (`const r = ...`),
            // które zaśmieciłyby mapę bez żadnej wartości nawigacyjnej.
            makeEntry({
              name: decl.id.name,
              parent: parentName,
              kind: "data",
              node: decl,
              exported,
              startLine: decl.loc.start.line,
              endLine: decl.loc.end.line,
            });
          }
        }
        continue;
      }

      if (inner.type === "IfStatement" && containsJSX(inner.consequent)) {
        const condition = source
          .slice(inner.test.range[0], inner.test.range[1])
          .replace(/\s+/g, " ")
          .trim();
        const entry = makeEntry({
          name: `@${condition}`,
          parent: parentName,
          kind: "view",
          node: inner,
          exported: false,
          startLine: inner.loc.start.line,
          endLine: inner.loc.end.line,
        });
        createdHere += 1;
        if (inner.consequent.type === "BlockStatement") {
          visitBody(inner.consequent.body, entry.name);
        }
        continue;
      }
    }

    // Reszta JSX poza gałęziami if — istotna tylko wtedy, gdy to ciało miało już
    // inne wydzielone wpisy (duży komponent typu DeadlineDay); dla zwykłego,
    // jednolitego komponentu jego własny wpis już obejmuje cały return.
    const last = statements[statements.length - 1];
    if (last && last.type === "ReturnStatement" && createdHere > 0 && containsJSX(last)) {
      makeEntry({
        name: "@return",
        parent: parentName,
        kind: "view",
        node: last,
        exported: false,
        startLine: last.loc.start.line,
        endLine: last.loc.end.line,
      });
    }
  }

  visitBody(programBody, null);
  return entries;
}

function isMathRandomCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "Math" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "random"
  );
}

function analyzeEntries(entries) {
  // Dopasowanie po nazwach identyfikatorów, bez analizy scope (eslint-scope nie
  // jest zależnością projektu) — świadomy kompromis, patrz nagłówek raportu.
  const knownNames = new Set(entries.filter((e) => e.kind !== "view").map((e) => e.name));

  for (const entry of entries) {
    const exclude = new Set(entries.filter((e) => e !== entry).map((e) => e.node));
    const refs = new Set();
    walkOwn(entry.node, exclude, (node) => {
      if (
        (node.type === "Identifier" || node.type === "JSXIdentifier") &&
        node.name !== entry.name &&
        knownNames.has(node.name)
      ) {
        refs.add(node.name);
      }
      if (node.type === "JSXElement" || node.type === "JSXFragment") {
        entry.jsx = true;
      }
      if (isMathRandomCall(node)) {
        entry.random = true;
        entry.randomLines.push(node.loc.start.line);
      }
      if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        HOOK_CALL_RE.test(node.callee.name)
      ) {
        entry.hooks = true;
      }
    });
    entry.refs = Array.from(refs).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  for (const entry of entries) {
    if (entry.kind === "fn") entry.kind = entry.jsx ? "comp" : "fn";
  }

  const byName = new Map(entries.map((e) => [e.name, e]));
  for (const entry of entries) {
    for (const ref of entry.refs) {
      byName.get(ref)?.referencedBy.push(entry.name);
    }
  }
}

function computeDepths(entries) {
  const byName = new Map(entries.map((e) => [e.name, e]));
  const depth = new Map();
  const state = new Map();
  const cycles = [];

  function visit(name, path) {
    if (state.get(name) === 2) return depth.get(name) ?? 0;
    if (state.get(name) === 1) {
      cycles.push([...path, name].join(" -> "));
      return 0;
    }
    const entry = byName.get(name);
    if (!entry) return 0;
    state.set(name, 1);
    let max = 0;
    for (const ref of entry.refs) {
      if (ref === name || !byName.has(ref)) continue;
      const d = visit(ref, [...path, name]);
      if (d + 1 > max) max = d + 1;
    }
    state.set(name, 2);
    depth.set(name, max);
    return max;
  }

  for (const entry of entries) visit(entry.name, []);
  return { depth, cycles };
}

function qualifiedName(entry) {
  return entry.parent ? `${entry.parent}>${entry.name}` : entry.name;
}

function nestLevel(entry, byName) {
  let level = 0;
  let current = entry;
  while (current.parent) {
    level += 1;
    current = byName.get(current.parent);
    if (!current) break;
  }
  return level;
}

function renderColumns(rows) {
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  return rows
    .map((r) =>
      r
        .map((cell, col) => cell.padEnd(widths[col]))
        .join("  ")
        .trimEnd()
    )
    .join("\n");
}

function formatTable(entries, depth) {
  const byName = new Map(entries.map((e) => [e.name, e]));
  const header = ["NAZWA", "LINIE", "LEN", "RODZ", "FLG", "GŁĘB", "REFS"];
  const rows = entries.map((e) => {
    const indent = "  ".repeat(nestLevel(e, byName));
    const flags = `${e.random ? "R" : ""}${e.jsx ? "J" : ""}${e.hooks ? "H" : ""}` || "-";
    return [
      indent + e.name,
      `${e.startLine}-${e.endLine}`,
      String(e.endLine - e.startLine + 1),
      e.kind,
      flags,
      String(depth.get(e.name) ?? 0),
      e.refs.length ? e.refs.join(",") : "-",
    ];
  });
  return renderColumns([header, ...rows]);
}

function buildReport(file, source, entries) {
  const totalLines = splitLines(source).length;
  const { depth, cycles } = computeDepths(entries);
  const lines = [];
  lines.push(`${file} — ${totalLines} linii, ${entries.length} wpisów`);
  lines.push(
    "flagi: R=Math.random  J=JSX  H=hooki | GŁĘB = głębokość zależności (0 = bez zależności; sortuj rosnąco pod kolejność ekstrakcji) | refs = odwołania do innych wpisów"
  );
  lines.push(
    "uwaga: dopasowanie po nazwach identyfikatorów, bez analizy scope; gałęzie renderu (view) wykrywane po obecności JSX w bloku if — pomocnik nawigacyjny, nie źródło prawdy"
  );
  lines.push("");
  lines.push(formatTable(entries, depth));
  lines.push("");

  const outsideRandom = [];
  for (const entry of entries) {
    if (entry.name === "los" || entry.name === "wybierz") continue;
    for (const line of entry.randomLines) outsideRandom.push(`${qualifiedName(entry)}:${line}`);
  }
  lines.push(`Math.random() poza los/wybierz — ${outsideRandom.length}`);
  lines.push(outsideRandom.length ? outsideRandom.join(", ") : "(brak)");

  if (cycles.length) {
    lines.push("");
    lines.push(`Cykle w grafie referencji — ${cycles.length}`);
    for (const cycle of cycles) lines.push(`  ${cycle}`);
  }
  lines.push("");

  const dead = entries.filter(
    (e) => e.kind !== "view" && !e.exported && e.referencedBy.length === 0
  );
  lines.push(`Zero referencji, potencjalnie martwe — ${dead.length}`);
  lines.push(dead.length ? dead.map(qualifiedName).join(", ") : "(brak)");

  return lines.join("\n");
}

function buildJson(file, source, entries) {
  const { depth, cycles } = computeDepths(entries);
  return JSON.stringify(
    {
      file,
      totalLines: splitLines(source).length,
      entries: entries.map((entry) => ({
        name: entry.name,
        parent: entry.parent,
        kind: entry.kind,
        startLine: entry.startLine,
        endLine: entry.endLine,
        lineCount: entry.endLine - entry.startLine + 1,
        exported: entry.exported,
        random: entry.random,
        jsx: entry.jsx,
        hooks: entry.hooks,
        randomLines: entry.randomLines,
        refs: entry.refs,
        referencedBy: entry.referencedBy,
        extractDepth: depth.get(entry.name) ?? 0,
      })),
      cycles,
    },
    null,
    2
  );
}

function printSlice(names, source, entries) {
  const lines = source.split("\n");
  for (const name of names) {
    const entry = entries.find((e) => e.name === name);
    if (!entry) {
      console.log(`# ${name}: nie znaleziono`);
      continue;
    }
    console.log(`# ${qualifiedName(entry)} (${entry.startLine}-${entry.endLine})`);
    for (let ln = entry.startLine; ln <= entry.endLine; ln += 1) {
      console.log(`${String(ln).padStart(5)} | ${lines[ln - 1]}`);
    }
    console.log("");
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const absPath = resolve(process.cwd(), options.path);
  const source = readFileSync(absPath, "utf8");
  const ast = parse(source, {
    ecmaVersion: 2023,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
    loc: true,
    range: true,
  });

  const entries = collectEntries(ast.body, source);
  analyzeEntries(entries);

  if (options.slice) {
    printSlice(options.slice, source, entries);
    return;
  }
  if (options.json) {
    console.log(buildJson(options.path, source, entries));
    return;
  }
  console.log(buildReport(options.path, source, entries));
}

main();
